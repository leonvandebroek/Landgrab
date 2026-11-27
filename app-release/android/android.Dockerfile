# syntax=docker/dockerfile:1.7
# Builds the signed Android app bundle (.aab) inside Docker, so the build machine needs nothing but Docker (the
# google-play skill). Secrets arrive as BuildKit secrets and never end up in a layer: google-services.json and the
# upload key. Build from the repository root:
#   DOCKER_BUILDKIT=1 docker build -f app-release/android/android.Dockerfile --build-arg MOBILE_DIR=<dir> \
#     --secret id=upload_keystore,src=upload.p12 --secret id=keystore_env,src=keystore.env \
#     --build-arg VERSION_CODE=42 --build-arg VERSION_NAME=1.0.42 --target out --output type=local,dest=out .
FROM eclipse-temurin:21-jdk AS build
ARG ANDROID_CMDLINE_TOOLS=13114758
ARG ANDROID_PLATFORM=android-36
ARG ANDROID_BUILD_TOOLS=36.0.0
ENV ANDROID_HOME=/opt/android
# Node 22 for the Capacitor CLI, taken from the official image.
COPY --from=node:22-bookworm-slim /usr/local/ /usr/local/
RUN apt-get update && apt-get install -y --no-install-recommends curl unzip ca-certificates && rm -rf /var/lib/apt/lists/* \
 && mkdir -p $ANDROID_HOME/cmdline-tools && cd $ANDROID_HOME/cmdline-tools \
 && curl -fsSL -o tools.zip https://dl.google.com/android/repository/commandlinetools-linux-${ANDROID_CMDLINE_TOOLS}_latest.zip \
 && unzip -q tools.zip && rm tools.zip && mv cmdline-tools latest \
 && yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses > /dev/null \
 && $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager "platforms;${ANDROID_PLATFORM}" "build-tools;${ANDROID_BUILD_TOOLS}" "platform-tools" > /dev/null
ARG MOBILE_DIR=mobile
# The repository's own layout under /repo: android/app/build.gradle applies app-release/android/signing.gradle by a
# relative path that climbs out of MOBILE_DIR to the repository root, so that file must sit where it does in the repo.
WORKDIR /repo/${MOBILE_DIR}
COPY app-release/android/signing.gradle /repo/app-release/android/signing.gradle
COPY ${MOBILE_DIR}/package.json ${MOBILE_DIR}/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY ${MOBILE_DIR}/ ./
ARG SYNC="npx cap sync android"
ARG APP_SLUG=app
ARG VERSION_CODE=1
ARG VERSION_NAME=1.0
RUN --mount=type=secret,id=google_services,required=false \
    --mount=type=secret,id=upload_keystore,required=false \
    --mount=type=secret,id=keystore_env,required=false \
    set -e; \
    sh -c "$SYNC"; \
    if [ -s /run/secrets/google_services ]; then cp /run/secrets/google_services android/app/google-services.json; fi; \
    if [ -s /run/secrets/keystore_env ]; then set -a; . /run/secrets/keystore_env; set +a; export ANDROID_KEYSTORE=/run/secrets/upload_keystore; \
      else echo "warning: no upload key, this bundle is not signed for Google Play"; fi; \
    cd android && ./gradlew --no-daemon bundleRelease -PappVersionCode=$VERSION_CODE -PappVersionName=$VERSION_NAME; \
    mkdir -p /out && cp app/build/outputs/bundle/release/app-release.aab /out/$APP_SLUG-$VERSION_NAME.aab; \
    rm -f app/google-services.json

FROM scratch AS out
COPY --from=build /out/ /
