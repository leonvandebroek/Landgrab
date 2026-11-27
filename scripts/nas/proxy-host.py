#!/usr/bin/env python3
"""Copied from unity-tech-app-management/scripts/nas/proxy-host.py (docs/nginx-proxy-manager.md there), set up for Landgrab:
its own NPM service user, Key Vault kv-landgrab-prod and deploy/proxy-hosts/hosts.json.

Keep Landgrab's proxy hosts in Nginx Proxy Manager (NPM) on the NAS in line with deploy/proxy-hosts/hosts.json.

  Service user (the pipeline, or the Mac):
    proxy-host.py status                     NPM version, signed-in user, own hosts
    proxy-host.py list                       the hosts the service user owns
    proxy-host.py sync [--apply] [--verify]  make NPM match the file (create and update; never delete)
    proxy-host.py verify                     call every host in the file over HTTPS
    proxy-host.py disable|enable <name> [--apply]

  NPM administrator, on the Mac only (asks for the admin sign-in in a hidden prompt):
    proxy-host.py setup [--adopt]            create the service user, store its password in Key Vault, copy the
                                             live settings of the hosts in the file into the file, optionally adopt them
    proxy-host.py export <name>... [--write] print (or write into the file) a host's live settings, custom config included
    proxy-host.py adopt <name>... [--apply]  move a host to the service user: same settings, same certificate

Rules (docs/nginx-proxy-manager.md): a dry run unless --apply; a backup before every change; only names in the file under
its allowed_suffixes, and never Time for Guests or identity.unitytech.nl, whatever the file says; the service user sees
only the hosts it created (NPM's own "visibility: user"), so it cannot even read another project's host; nothing is
deleted, except the one admin step in adopt that replaces a host by an identical one owned by the service user. Writes
stop on an NPM version this tool was not tested with. Secrets and tokens are never printed. Standard library only.

Connection: NPM_URL; else NPM's admin port on the LAN (http://10.233.1.253:8081) when it answers; else an ssh tunnel.
Service credentials: NPM_IDENTITY + NPM_SECRET, else Key Vault (az), else the macOS keychain item "landgrab-npm-proxy".
"""
import argparse
import copy
import datetime
import getpass
import http.client
import json
import os
import re
import secrets
import socket
import ssl
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
HOSTS_FILE = os.environ.get("NPM_HOSTS_FILE", os.path.join(HERE, "..", "..", "deploy", "proxy-hosts", "hosts.json"))
KEYCHAIN_SERVICE = "landgrab-npm-proxy"
VAULT = os.environ.get("NPM_VAULT", "kv-landgrab-prod")
SUBSCRIPTION = os.environ.get("UNITYTECH_AZ_SUBSCRIPTION", "67ff3e21-432f-4d22-9691-77237abd29ff")
VAULT_IDENTITY, VAULT_SECRET = "npm-landgrab-proxy-identity", "npm-landgrab-proxy-secret"
SERVICE_EMAIL = os.environ.get("NPM_SERVICE_EMAIL", "npm-landgrab-proxy@leonvandebroek.nl")
SERVICE_NAME = "Landgrab proxy automation"
CONTAINER = os.environ.get("NPM_CONTAINER", "nginx-proxy-manager")
NAS = f"{os.environ.get('NAS_USER', 'leon')}@{os.environ.get('NAS_HOST', 'unitystationpro.local')}"

# NPM versions this tool was tested against (scripts/nas/proxy-host.npm-test.sh runs a real container of each). NPM on the
# NAS runs the image tag "latest", so a pull can bring a new API; writes stop until the new version is tested and added.
TESTED_VERSIONS = {"2.14.0"}
# Never changed, whatever the file says: Time for Guests, and the identity server it shares with UTA (Unitytech.Platform's).
PROTECTED = (re.compile(r"(^|\.)timeforguests\.[a-z]+$"), re.compile(r"practipitality"), re.compile(r"^identity\.unitytech\.nl$"))
# The proxy host fields the file manages, by NPM's own names. certificate_id is handled separately.
FIELDS = ("forward_scheme", "forward_host", "forward_port", "ssl_forced", "http2_support", "hsts_enabled", "hsts_subdomains",
          "block_exploits", "caching_enabled", "allow_websocket_upgrade", "trust_forwarded_proto", "access_list_id",
          "advanced_config", "locations")
FILE_ONLY = ("certificate", "pending_adoption", "note")
SERVICE_PERMISSIONS = {"visibility": "user", "proxy_hosts": "manage", "certificates": "manage", "access_lists": "hidden",
                       "dead_hosts": "hidden", "redirection_hosts": "hidden", "streams": "hidden"}
DOMAIN = re.compile(r"^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")


class Refused(Exception):
    """A request this tool will not carry out. Exit status 2, nothing written."""


class Untested(Exception):
    """NPM runs a version this tool was not tested with. Exit status 3, nothing written."""


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(f"NPM API {status}: {message}")
        self.status, self.message = status, message


# ---- the hosts file ---------------------------------------------------------------------------------------------------

class HostsFile:
    def __init__(self, path=HOSTS_FILE):
        self.path = os.path.abspath(path)
        with open(self.path) as f:
            self.data = json.load(f)
        self.suffixes = tuple(s.lower() for s in self.data.get("allowed_suffixes", []))
        self.defaults = self.data.get("defaults", {})
        self.hosts = self.data.get("hosts", [])
        seen = set()
        for entry in self.hosts:
            names = [check_domain(d) for d in entry.get("domain_names", [])]
            if not names:
                raise Refused(f"{self.path}: a host without domain_names")
            for name in names:
                if name in seen:
                    raise Refused(f"{self.path}: {name} appears twice")
                seen.add(name)
                if forbidden(name, self.suffixes):
                    raise Refused(f"{self.path}: {name} {forbidden(name, self.suffixes)}")
            unknown = set(entry) - set(FIELDS) - set(FILE_ONLY) - {"domain_names", "certificate_id"}
            if unknown:
                raise Refused(f"{self.path}: unknown fields {sorted(unknown)} for {names[0]}")
            entry["domain_names"] = names
        self.names = seen

    def entry(self, name):
        return next((e for e in self.hosts if name in e["domain_names"]), None)

    def desired(self, entry):
        """The proxy host fields NPM should have for this entry, defaults filled in."""
        merged = dict(copy.deepcopy(self.defaults), **copy.deepcopy(entry))
        want = {k: merged[k] for k in FIELDS if k in merged}
        want["domain_names"] = sorted(entry["domain_names"])
        if "forward_port" not in want:
            raise Refused(f"{entry['domain_names'][0]}: no forward_port (copy the live settings with export --write)")
        return want, merged.get("certificate_id"), merged.get("certificate", "letsencrypt")

    def write_entry(self, names, live, pending=True):
        """Replace the entry for these names with the live host's settings, written out in full (no defaults). Until it is
        adopted the entry stays pending_adoption, so sync leaves the host to its current owner."""
        entry = {"domain_names": sorted(names)}
        entry.update({k: live[k] for k in FIELDS if k in live})
        if live.get("certificate_id"):
            entry["certificate_id"] = live["certificate_id"]
        else:
            entry["certificate"] = "none"
        if pending:
            entry["pending_adoption"] = True
        for i, e in enumerate(self.hosts):
            if set(e["domain_names"]) & set(names):
                self.hosts[i] = entry
                break
        else:
            raise Refused(f"{names[0]} is not in {self.path}; add it there first, in a reviewed pull request")
        self.data["hosts"] = self.hosts
        with open(self.path, "w") as f:
            json.dump(self.data, f, indent=2, ensure_ascii=False)
            f.write("\n")


def check_domain(name):
    name = (name or "").strip().lower()
    if not DOMAIN.match(name):
        raise Refused(f"'{name}' is not a valid host name")
    return name


def forbidden(name, suffixes):
    """Why this tool may never change a host with this name, or None."""
    if any(p.search(name) for p in PROTECTED):
        return "is Time for Guests' or the shared identity's, and this tool never changes it"
    if not any(name == s or name.endswith("." + s) for s in suffixes):
        return f"is outside the allowed suffixes {list(suffixes)}"
    return None


def managed(hosts_file, names):
    """True when every name of a host is in the file (and so allowed)."""
    names = [n.lower() for n in names]
    return bool(names) and all(n in hosts_file.names for n in names)


# ---- connection -------------------------------------------------------------------------------------------------------

def ssh(command):
    return subprocess.run(["ssh", "-o", "BatchMode=yes", NAS, command], capture_output=True, text=True, timeout=30)


# NPM's admin port on the NAS LAN address (container port 81 published as 8081). Tried first, before any ssh.
LAN_URL = os.environ.get("NPM_LAN_URL", "http://10.233.1.253:8081")
# A non-interactive ssh shell on Synology DSM does not have /usr/local/bin (where docker lives) on its PATH.
REMOTE_DOCKER = "PATH=/usr/local/bin:/usr/bin:/bin:$PATH docker"


def lan_reachable(url):
    try:
        with urllib.request.urlopen(url.rstrip("/") + "/api/", timeout=4) as resp:
            return "version" in json.loads(resp.read() or b"{}")
    except (OSError, ValueError):
        return False


def tunnel_target():
    answer = ssh(f"{REMOTE_DOCKER} port {CONTAINER} 81/tcp")
    for line in answer.stdout.splitlines():
        m = re.match(r"^(\d+\.\d+\.\d+\.\d+):(\d+)$", line.strip())
        if m:
            host = "127.0.0.1" if m.group(1) == "0.0.0.0" else m.group(1)
            return f"{host}:{m.group(2)}"
    inspect = ssh(f"{REMOTE_DOCKER} inspect -f '{{{{range .NetworkSettings.Networks}}}}{{{{.IPAddress}}}} {{{{end}}}}' {CONTAINER}")
    ips = inspect.stdout.split()
    if ips:
        return f"{ips[0]}:81"
    # ssh adds its own warnings (for example about post-quantum key exchange) to stderr; keep the lines about docker.
    why = [ln for ln in (answer.stderr + inspect.stderr).splitlines() if "docker" in ln.lower() or "not found" in ln.lower()]
    raise SystemExit(f"could not reach NPM: {LAN_URL} did not answer, and on {NAS} 'docker port {CONTAINER} 81/tcp' gave "
                     f"{why[-1] if why else 'no output'!r} (exit {answer.returncode}). Set NPM_URL to NPM's admin address to skip both.")


def open_tunnel():
    target = tunnel_target()
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    proc = subprocess.Popen(["ssh", "-N", "-o", "BatchMode=yes", "-o", "ExitOnForwardFailure=yes",
                             "-L", f"127.0.0.1:{port}:{target}", NAS], stdin=subprocess.DEVNULL)
    for _ in range(50):
        if proc.poll() is not None:
            raise SystemExit("the ssh tunnel to the NAS closed")
        try:
            socket.create_connection(("127.0.0.1", port), timeout=0.5).close()
            return f"http://127.0.0.1:{port}", proc
        except OSError:
            time.sleep(0.2)
    proc.terminate()
    raise SystemExit("the ssh tunnel to the NAS did not open")


def az(*args):
    cmd = ["az", *args, "--subscription", SUBSCRIPTION, "--only-show-errors"]
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    except FileNotFoundError:
        return None


def service_credentials():
    identity, secret = os.environ.get("NPM_IDENTITY"), os.environ.get("NPM_SECRET")
    if identity and secret:
        return identity, secret
    if os.environ.get("NPM_NO_VAULT") != "1":
        got = [az("keyvault", "secret", "show", "--vault-name", VAULT, "--name", n, "--query", "value", "-o", "tsv")
               for n in (VAULT_IDENTITY, VAULT_SECRET)]
        if all(g is not None and g.returncode == 0 and g.stdout.strip() for g in got):
            return got[0].stdout.strip(), got[1].stdout.rstrip("\n")
    try:
        meta = subprocess.run(["security", "find-generic-password", "-s", KEYCHAIN_SERVICE], capture_output=True, text=True)
        secret = subprocess.run(["security", "find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"],
                                capture_output=True, text=True).stdout.rstrip("\n")
        m = re.search(r'"acct"<blob>="([^"]+)"', meta.stdout)
        if m and secret:
            return m.group(1), secret
    except FileNotFoundError:
        pass
    raise SystemExit(f"no service credentials: set NPM_IDENTITY and NPM_SECRET, sign in with az (Key Vault {VAULT}), "
                     "or run setup first (docs/nginx-proxy-manager.md)")


class Npm:
    def __init__(self, base):
        self.base, self.token, self.who = base.rstrip("/"), None, None

    def call(self, method, path, body=None, timeout=30):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method)
        req.add_header("Content-Type", "application/json")
        if self.token:
            req.add_header("Authorization", "Bearer " + self.token)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read()
        except urllib.error.HTTPError as e:
            try:
                message = json.loads(e.read()).get("error", {}).get("message", "")
            except ValueError:
                message = ""
            raise ApiError(e.code, message or e.reason) from None
        return json.loads(raw) if raw else None

    def version(self):
        v = (self.call("GET", "/api/") or {}).get("version", {})
        return f"{v.get('major', '?')}.{v.get('minor', '?')}.{v.get('revision', '?')}"

    def require_tested(self):
        version = self.version()
        if version not in TESTED_VERSIONS and os.environ.get("NPM_ALLOW_UNTESTED") != "1":
            raise Untested(f"NPM runs {version}; this tool is tested with {', '.join(sorted(TESTED_VERSIONS))} only. "
                           "Nothing changed. Test the new version (scripts/nas/proxy-host.npm-test.sh) and add it to TESTED_VERSIONS.")
        return version

    def login(self, identity, secret, ask_code=None):
        answer = self.call("POST", "/api/tokens", {"identity": identity, "secret": secret})
        if answer.get("requires_2fa"):
            if not ask_code:
                raise SystemExit(f"the NPM user {identity} has two-factor sign-in; the service user must not (docs/nginx-proxy-manager.md)")
            answer = self.call("POST", "/api/tokens/2fa", {"challenge_token": answer["challenge_token"], "code": ask_code()})
        self.token, self.who = answer["token"], identity

    def hosts(self):
        return self.call("GET", "/api/nginx/proxy-hosts")

    def certificates(self):
        return self.call("GET", "/api/nginx/certificates")

    def me(self):
        return self.call("GET", "/api/users/me") or {}


def admin_session(base):
    """The NPM administrator, signed in from a hidden prompt (or, for the tests only, NPM_ADMIN_IDENTITY/_SECRET)."""
    identity, secret = os.environ.get("NPM_ADMIN_IDENTITY"), os.environ.get("NPM_ADMIN_SECRET")
    if not (identity and secret):
        if not sys.stdin.isatty():
            raise Refused("admin commands ask for the NPM admin sign-in and run only in a terminal on the Mac")
        identity = input("NPM admin e-mail: ").strip()
        secret = getpass.getpass("NPM admin password (not shown, not stored): ")
    npm = Npm(base)
    npm.login(identity, secret, ask_code=lambda: getpass.getpass("NPM two-factor code: ").strip())
    if "admin" not in (npm.me().get("roles") or []):
        raise Refused(f"{identity} is not an NPM administrator")
    return npm


# ---- helpers ----------------------------------------------------------------------------------------------------------

def host_for(hosts, name):
    return next((h for h in hosts if name in [d.lower() for d in h.get("domain_names", [])]), None)


def live_fields(h):
    out = {k: h[k] for k in FIELDS if k in h}
    out["domain_names"] = sorted(d.lower() for d in h.get("domain_names", []))
    if out.get("advanced_config") is None:
        out["advanced_config"] = ""
    if out.get("locations") is None:
        out["locations"] = []
    return out


def differences(want, have):
    return {k: (have.get(k), v) for k, v in want.items() if have.get(k) != v}


def backup(hosts, certs, label):
    folder = os.environ.get("NPM_BACKUP_DIR", os.path.join(os.path.expanduser("~"), ".landgrab-npm-backups"))
    os.makedirs(folder, mode=0o700, exist_ok=True)
    certs = copy.deepcopy(certs)
    for c in certs:
        for k in ("certificate", "certificate_key", "intermediate_certificate"):
            (c.get("meta") or {}).pop(k, None)
    path = os.path.join(folder, f"{datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')}-{label}.json")
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump({"taken_at": datetime.datetime.now(datetime.timezone.utc).isoformat(), "proxy_hosts": hosts, "certificates": certs}, f, indent=1)
    print(f"backup: {path}")


def describe(h):
    flags = ["force-ssl" if h.get("ssl_forced") else "no force-ssl", f"certificate {h.get('certificate_id') or 'none'}"]
    if not h.get("enabled", True):
        flags.append("DISABLED")
    return f"{', '.join(h.get('domain_names', []))} -> {h.get('forward_scheme')}://{h.get('forward_host')}:{h.get('forward_port')} ({'; '.join(flags)})"


def request_certificate(npm, names):
    print(f"requesting a Let's Encrypt certificate for {', '.join(names)} (can take a minute)")
    body = {"provider": "letsencrypt", "nice_name": names[0], "domain_names": names, "meta": {"dns_challenge": False}}
    return npm.call("POST", "/api/nginx/certificates", body, timeout=300)


def verify_https(name):
    """None when https://name answers with a valid certificate and the app behind it answers, else why not."""
    if os.environ.get("NPM_VERIFY") == "skip":
        return None
    try:
        conn = http.client.HTTPSConnection(name, timeout=15, context=ssl.create_default_context())
        conn.request("GET", "/", headers={"User-Agent": "landgrab-proxy-host-check"})
        resp = conn.getresponse()
        cert = conn.sock.getpeercert() if conn.sock else {}
        conn.close()
    except ssl.SSLError as e:
        return f"certificate problem: {e.reason or e}"
    except OSError as e:
        return f"no answer: {e}"
    if resp.status in (502, 503, 504):
        return f"NPM answers, the app behind it does not (HTTP {resp.status})"
    expires = cert.get("notAfter") if cert else None
    if expires:
        days = (datetime.datetime.strptime(expires, "%b %d %H:%M:%S %Y %Z") - datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)).days
        if days < 14:
            return f"certificate expires in {days} days"
    return None


# ---- service-user commands --------------------------------------------------------------------------------------------

def cmd_status(npm, hf, args):
    version = npm.version()
    tested = "tested" if version in TESTED_VERSIONS else "NOT TESTED, writes stop"
    me = npm.me()
    print(f"NPM {version} ({tested}), signed in as {me.get('email', '?')}")
    own = npm.hosts()
    print(f"{len(own)} proxy hosts owned by this user; {len(hf.hosts)} in {os.path.relpath(hf.path)}")


def cmd_list(npm, hf, args):
    for h in sorted(npm.hosts(), key=lambda h: (h.get("domain_names") or [""])[0]):
        print(describe(h) + ("" if managed(hf, h.get("domain_names", [])) else " (not in the file, left alone)"))


def plan_sync(npm, hf):
    own = npm.hosts()
    plan, notes = [], []
    for entry in hf.hosts:
        names = entry["domain_names"]
        if entry.get("pending_adoption"):
            notes.append(f"{names[0]}: waiting for adoption from its current owner (setup --adopt or adopt)")
            continue
        want, cert_id, cert_mode = hf.desired(entry)
        have = next((h for h in own if set(d.lower() for d in h.get("domain_names", [])) & set(names)), None)
        if cert_id:
            want["certificate_id"] = cert_id
        elif cert_mode == "none":
            want["certificate_id"] = 0
        if have:
            if sorted(d.lower() for d in have["domain_names"]) != want["domain_names"]:
                raise Refused(f"the proxy host {have['id']} serves {have['domain_names']}, the file says {want['domain_names']}")
            if cert_mode == "letsencrypt" and not cert_id:
                want["certificate_id"] = have.get("certificate_id") or "new"
            diff = differences(want, live_fields(have) | {"certificate_id": have.get("certificate_id")})
            if diff:
                plan.append(("update", names, want, have, diff))
        else:
            if cert_mode == "letsencrypt" and not cert_id:
                want["certificate_id"] = "new"
            plan.append(("create", names, want, None, None))
    for h in own:
        if not managed(hf, h.get("domain_names", [])):
            notes.append(f"{', '.join(h['domain_names'])}: owned by this user but not in the file; left alone (disable it with disable)")
    return plan, notes, own


def cmd_sync(npm, hf, args):
    version = npm.require_tested()
    plan, notes, own = plan_sync(npm, hf)
    for note in notes:
        print(note)
    if not plan:
        print(f"NPM {version} matches {os.path.relpath(hf.path)}: nothing to do")
    for action, names, want, have, diff in plan:
        print(f"{names[0]}: {action}" + (f" proxy host {have['id']}" if have else ""))
        for k, v in (diff.items() if diff else want.items()):
            shown = f"{json.dumps(v[0])} -> {json.dumps(v[1])}" if diff else json.dumps(v)
            print(f"  {k}: {shown}")
    if plan and not args.apply:
        print("dry run: nothing changed (add --apply)")
        return 0
    failed = []
    if plan:
        backup(own, npm.certificates(), "sync")
    for action, names, want, have, diff in plan:
        try:
            body = dict(want)
            if body.get("certificate_id") == "new":
                body["certificate_id"] = request_certificate(npm, names)["id"]
            if action == "create":
                result = npm.call("POST", "/api/nginx/proxy-hosts", body)
            else:
                body = {k: v for k, v in body.items() if have.get(k) != v and k != "domain_names"}
                result = npm.call("PUT", f"/api/nginx/proxy-hosts/{have['id']}", body)
            print("done: " + describe(result))
            if (result.get("meta") or {}).get("nginx_online") is False:
                failed.append(f"{names[0]}: NPM reports nginx not online: {(result.get('meta') or {}).get('nginx_err')}")
        except ApiError as e:
            if action == "create" and "already in use" in e.message:
                failed.append(f"{names[0]}: another NPM user owns this name; adopt it first (adopt {names[0]})")
            else:
                failed.append(f"{names[0]}: {e}")
    if args.verify:
        failed += verify_all(hf, [p[1][0] for p in plan] if plan else None)
    for f in failed:
        print(f"problem: {f}", file=sys.stderr)
    return 1 if failed else 0


def verify_all(hf, only=None):
    problems = []
    for entry in hf.hosts:
        if entry.get("pending_adoption") or hf.desired(entry)[2] == "none" and not entry.get("certificate_id"):
            continue
        for name in entry["domain_names"]:
            if only is not None and name not in only:
                continue
            why = verify_https(name)
            print(f"https://{name}: {why or 'ok'}")
            if why:
                problems.append(f"https://{name}: {why}")
    return problems


def cmd_verify(npm, hf, args):
    problems = verify_all(hf)
    return 4 if problems else 0


def cmd_toggle(npm, hf, args):
    name = check_domain(args.domain)
    if not managed(hf, [name]):
        raise Refused(f"{name} is not in {os.path.relpath(hf.path)}")
    npm.require_tested()
    h = host_for(npm.hosts(), name)
    if not h:
        raise Refused(f"the service user owns no proxy host for {name}")
    want = args.command == "enable"
    if bool(h.get("enabled", True)) == want:
        print(f"{name}: already {args.command}d")
        return 0
    print(f"{name}: {args.command} proxy host {h['id']}")
    if not args.apply:
        print("dry run: nothing changed (add --apply)")
        return 0
    backup(npm.hosts(), npm.certificates(), args.command)
    npm.call("POST", f"/api/nginx/proxy-hosts/{h['id']}/{args.command}")
    print("done")
    return 0


# ---- admin commands ---------------------------------------------------------------------------------------------------

def adoptable(hf, admin_hosts, name):
    """The live host for a name in the file, refused when it also serves names outside the file."""
    name = check_domain(name)
    if not hf.entry(name):
        raise Refused(f"{name} is not in {os.path.relpath(hf.path)}; add it there first, in a reviewed pull request")
    h = host_for(admin_hosts, name)
    if not h:
        raise Refused(f"there is no proxy host for {name}")
    if not managed(hf, h["domain_names"]):
        raise Refused(f"the proxy host for {name} also serves {', '.join(h['domain_names'])}, which is not in the file")
    return h


def cmd_export(admin, hf, args):
    hosts = admin.hosts()
    for name in args.domains:
        # Printing is reading only, so any host may be shown (for example identity.unitytech.nl's settings, to copy them for
        # a new UTA name); --write only for a name in the file.
        h = adoptable(hf, hosts, name) if args.write else host_for(hosts, check_domain(name))
        if not h:
            raise Refused(f"there is no proxy host for {name}")
        print(json.dumps(live_fields(h) | {"certificate_id": h.get("certificate_id")}, indent=2, ensure_ascii=False))
        if args.write:
            hf.write_entry(h["domain_names"], h)
            print(f"written into {os.path.relpath(hf.path)}")
    return 0


def adopt_one(admin, service, hf, name, apply):
    """Replace the live host by an identical one owned by the service user. Same settings, same certificate."""
    hosts = admin.hosts()
    h = adoptable(hf, hosts, name)
    if h.get("owner_user_id") == service.me().get("id"):
        print(f"{name}: already owned by the service user")
        return True
    entry = hf.entry(name)
    missing = [k for k in FIELDS if k not in entry and k in h]
    if missing:
        raise Refused(f"{name}: the file does not hold its live settings yet ({', '.join(missing)}); run export {name} --write "
                      "first, so custom config (advanced_config, locations) is carried over")
    want, cert_id, _ = hf.desired(entry)
    have = live_fields(h)
    diff = differences(want, have)
    if (cert_id or None) != (h.get("certificate_id") or None):
        diff["certificate_id"] = (h.get("certificate_id"), cert_id)
    if diff:
        for k, (old, new) in diff.items():
            print(f"  {k}: live {json.dumps(old)}, file {json.dumps(new)}")
        raise Refused(f"{name}: the file differs from the live host, so adopting it would change it; run export {name} --write")
    body = dict(have, certificate_id=h.get("certificate_id") or 0)
    print(f"{name}: adopt proxy host {h['id']} (owner {h.get('owner_user_id')}): remove it as admin, then create the same host, "
          f"with certificate {h.get('certificate_id') or 'none'}, as the service user; a few seconds without this address")
    if not apply:
        return True
    backup(hosts, admin.certificates(), f"adopt-{name}")
    admin.call("DELETE", f"/api/nginx/proxy-hosts/{h['id']}")
    try:
        made = service.call("POST", "/api/nginx/proxy-hosts", body)
    except ApiError as e:
        print(f"{name}: creating it as the service user failed ({e}); putting the original back", file=sys.stderr)
        admin.call("POST", "/api/nginx/proxy-hosts", body)
        raise
    if not h.get("enabled", True):
        service.call("POST", f"/api/nginx/proxy-hosts/{made['id']}/disable")
    print("done: " + describe(made))
    hf.write_entry(made["domain_names"], made | {"certificate_id": h.get("certificate_id") or 0}, pending=False)
    print(f"{name}: no longer pending in {os.path.relpath(hf.path)}")
    return True


def cmd_adopt(admin, service, hf, args):
    admin.require_tested()
    for name in args.domains:
        adopt_one(admin, service, hf, name, args.apply)
    if not args.apply:
        print("dry run: nothing changed (add --apply)")
        return 0
    return 4 if verify_all(hf, [check_domain(n) for n in args.domains]) else 0


def store_in_vault(identity, secret):
    """Put the service credentials in Key Vault. A temporary Secrets Officer grant if the signed-in user can only read."""
    def put():
        ok = True
        for name, value in ((VAULT_IDENTITY, identity), (VAULT_SECRET, secret)):
            fd, path = tempfile.mkstemp()
            try:
                with os.fdopen(fd, "w") as f:
                    f.write(value)
                r = az("keyvault", "secret", "set", "--vault-name", VAULT, "--name", name, "--file", path, "--encoding", "utf-8", "-o", "none")
            finally:
                os.unlink(path)
            if r is None:
                raise SystemExit("az is not installed; install the Azure CLI and run az login first")
            if r.returncode != 0:
                ok = False
                if "Forbidden" not in r.stderr and "403" not in r.stderr:
                    raise SystemExit(f"could not store {name} in {VAULT}: {r.stderr.strip()[:300]}")
        return ok

    if put():
        print(f"stored in Key Vault {VAULT}: {VAULT_IDENTITY}, {VAULT_SECRET}")
        return
    print(f"your account can only read {VAULT}; adding a temporary 'Key Vault Secrets Officer' grant for this step")
    me = az("ad", "signed-in-user", "show", "--query", "id", "-o", "tsv")
    vault = az("keyvault", "show", "--name", VAULT, "--query", "id", "-o", "tsv")
    if not (me and vault and me.returncode == 0 and vault.returncode == 0):
        raise SystemExit("could not look up your account or the vault (az login?)")
    grant = az("role", "assignment", "create", "--assignee-object-id", me.stdout.strip(), "--assignee-principal-type", "User",
               "--role", "Key Vault Secrets Officer", "--scope", vault.stdout.strip(), "--query", "id", "-o", "tsv")
    if not grant or grant.returncode != 0:
        raise SystemExit(f"could not add the grant ({(grant.stderr if grant else '').strip()[:300]}); ask an Owner, then run setup again")
    try:
        for attempt in range(30):  # role assignments take a few minutes to reach Key Vault
            time.sleep(20)
            if put():
                print(f"stored in Key Vault {VAULT}: {VAULT_IDENTITY}, {VAULT_SECRET}")
                return
            print(f"  waiting for the grant to take effect ({attempt + 1})")
        raise SystemExit("the grant did not take effect within 10 minutes; run setup again (it is safe to repeat)")
    finally:
        az("role", "assignment", "delete", "--ids", grant.stdout.strip())
        print("temporary grant removed")


def cmd_setup(admin, hf, args, base):
    version = admin.require_tested()
    users = admin.call("GET", "/api/users") or []
    user = next((u for u in users if u.get("email", "").lower() == SERVICE_EMAIL), None)
    password = secrets.token_urlsafe(32)
    if user:
        print(f"service user {SERVICE_EMAIL} exists (id {user['id']}); giving it a new password")
        admin.call("PUT", f"/api/users/{user['id']}/auth", {"type": "password", "secret": password})
    else:
        user = admin.call("POST", "/api/users", {"name": SERVICE_NAME, "nickname": "landgrab-proxy", "email": SERVICE_EMAIL,
                                                  "roles": [], "is_disabled": False, "auth": {"type": "password", "secret": password}})
        print(f"service user {SERVICE_EMAIL} created (id {user['id']})")
    if "admin" in (user.get("roles") or []):
        raise Refused(f"{SERVICE_EMAIL} is an administrator; take that role away in NPM and run setup again")
    admin.call("PUT", f"/api/users/{user['id']}/permissions", SERVICE_PERMISSIONS)
    print("permissions: proxy hosts and certificates it created itself; everything else hidden")
    if args.secret_file:  # the tests only
        fd = os.open(args.secret_file, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as f:
            json.dump({"identity": SERVICE_EMAIL, "secret": password}, f)
    else:
        store_in_vault(SERVICE_EMAIL, password)
    service = Npm(base)
    service.login(SERVICE_EMAIL, password)
    print(f"checked: the service user signs in to NPM {version} and sees {len(service.hosts())} hosts of its own")

    hosts = admin.hosts()
    pending = [e for e in hf.hosts if e.get("pending_adoption")]
    for entry in pending:
        name = entry["domain_names"][0]
        h = host_for(hosts, name)
        if not h:
            print(f"{name}: no proxy host yet; sync will create it")
            continue
        adoptable(hf, hosts, name)
        hf.write_entry(h["domain_names"], h)
        print(f"{name}: live settings copied into {os.path.relpath(hf.path)}"
              + (" (custom config included)" if h.get("advanced_config") or h.get("locations") else ""))
    if args.adopt:
        hf = HostsFile(hf.path)
        names = [e["domain_names"][0] for e in pending if host_for(hosts, e["domain_names"][0])]
        for name in names:
            adopt_one(admin, service, hf, name, True)
        verify_all(hf, names)
    print("next: commit deploy/proxy-hosts/hosts.json" + ("" if args.adopt else ", then adopt the hosts (adopt <name> --apply)"))
    return 0


# ---- main -------------------------------------------------------------------------------------------------------------

def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--file", default=HOSTS_FILE, help="the hosts file (default deploy/proxy-hosts/hosts.json)")
    sub = p.add_subparsers(dest="command", required=True)
    sub.add_parser("status")
    sub.add_parser("list")
    sub.add_parser("verify")
    s = sub.add_parser("sync")
    s.add_argument("--apply", action="store_true")
    s.add_argument("--verify", action="store_true", help="call the changed hosts over HTTPS afterwards")
    for name in ("enable", "disable"):
        t = sub.add_parser(name)
        t.add_argument("domain")
        t.add_argument("--apply", action="store_true")
    st = sub.add_parser("setup")
    st.add_argument("--adopt", action="store_true", help="also move the existing hosts in the file to the service user")
    st.add_argument("--secret-file", help=argparse.SUPPRESS)
    ex = sub.add_parser("export")
    ex.add_argument("domains", nargs="+")
    ex.add_argument("--write", action="store_true")
    ad = sub.add_parser("adopt")
    ad.add_argument("domains", nargs="+")
    ad.add_argument("--apply", action="store_true")
    args = p.parse_args(argv)

    tunnel = None
    try:
        hf = HostsFile(args.file)
        if args.command == "verify":
            return cmd_verify(None, hf, args)
        base = os.environ.get("NPM_URL")
        if not base and lan_reachable(LAN_URL):
            base = LAN_URL
        if not base:
            base, tunnel = open_tunnel()
        if args.command in ("setup", "export", "adopt"):
            admin = admin_session(base)
            if args.command == "setup":
                return cmd_setup(admin, hf, args, base)
            if args.command == "export":
                return cmd_export(admin, hf, args)
            service = Npm(base)
            service.login(*service_credentials())
            return cmd_adopt(admin, service, hf, args)
        npm = Npm(base)
        npm.login(*service_credentials())
        return {"status": cmd_status, "list": cmd_list, "sync": cmd_sync, "enable": cmd_toggle,
                "disable": cmd_toggle}[args.command](npm, hf, args) or 0
    except Refused as r:
        print(f"refused: {r}", file=sys.stderr)
        return 2
    except Untested as u:
        print(f"stopped: {u}", file=sys.stderr)
        return 3
    except ApiError as a:
        print(f"{a}\nstopped; run 'list' to see what is in place before retrying", file=sys.stderr)
        return 1
    except (OSError, ValueError) as err:
        print(f"NPM did not answer as expected ({err})\nstopped; run 'list' to see what is in place before retrying", file=sys.stderr)
        return 1
    finally:
        if tunnel:
            tunnel.terminate()


if __name__ == "__main__":
    sys.exit(main())
