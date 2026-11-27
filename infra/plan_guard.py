"""Validate Terraform's JSON plan without printing resource values or secrets (pattern from Time for Guests)."""
import json
import sys

ALLOWED = {"azurerm_key_vault", "azurerm_role_assignment"}
ROLE_SECRETS_OFFICER = "b86a8fe4-44ce-4948-aee5-eccb2c155cd7"


def validate(plan, resource_group):
    errors = []
    for resource in plan.get("resource_changes", []):
        if resource.get("mode") == "data":
            continue
        address = resource["address"]
        change = resource["change"]
        if "delete" in change["actions"]:
            errors.append(f"{address}: deletion or replacement is not allowed")
        if resource["type"] not in ALLOWED:
            errors.append(f"{address}: resource type is outside this stack")
        for values in [change.get("before"), change.get("after")]:
            if not values:
                continue
            group = values.get("resource_group_name")
            if group and group != resource_group:
                errors.append(f"{address}: resource belongs to another resource group")
            for key in ("id", "scope"):
                resource_id = (values.get(key) or "").lower()
                if "/resourcegroups/" in resource_id and f"/resourcegroups/{resource_group.lower()}/" not in resource_id + "/":
                    errors.append(f"{address}: referenced resource is outside rg {resource_group}")
                if key == "scope" and resource_id and "/resourcegroups/" not in resource_id:
                    errors.append(f"{address}: role assignment must be scoped to this resource group")
            if resource["type"] == "azurerm_role_assignment":
                role = values.get("role_definition_name")
                role_id = (values.get("role_definition_id") or "").lower()
                if role not in (None, "Key Vault Secrets Officer") or (role_id and ROLE_SECRETS_OFFICER not in role_id):
                    errors.append(f"{address}: only Key Vault Secrets Officer may be assigned")
    return errors


if __name__ == "__main__":
    errors = validate(json.load(sys.stdin), sys.argv[1])
    if errors:
        sys.exit("\n".join(errors))
    print("Infrastructure plan passed: Key Vault and its Secrets Officer grants only, nothing deleted or replaced.")
