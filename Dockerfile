# No `# syntax=` directive on purpose: it makes BuildKit fetch a frontend image from the
# registry before reading this file, and nothing here needs a newer frontend than the one
# built in. Add it back only alongside a feature that requires it.

# Angular 22 requires Node ^22.22.3 || ^24.15.0 || >=26.0.0 (its own `engines` field),
# so the base must be Node 26 or newer.
#
# Debian slim: 381 MB, against 1.65 GB for the full Debian tag. Both were built and run
# end to end before this default was chosen — including the request that compiles the
# contract schema with ajv, which is what a stripped base would be most likely to break.
#
# Alpine would be smaller again, but the build stage compiles lmdb and msgpackr-extract
# through node-gyp, so an Alpine base needs python3/make/g++ installed there first.
ARG NODE_VERSION=26.7.0-bookworm-slim

# ---- build -------------------------------------------------------------------
# Needs the whole workspace: the Angular toolchain lives in web's dependencies and
# is only ever used here. Nothing from this stage reaches the final image except
# the compiled static output.
FROM node:${NODE_VERSION} AS build
WORKDIR /app

# Manifests first, so a source-only change does not re-run the install layer.
COPY package.json package-lock.json ./
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci

COPY api/ api/
COPY web/ web/
RUN npm run build --workspace=web

# ---- runtime -----------------------------------------------------------------
# The web app ships as static files, so the runtime carries no Angular toolchain:
# only api's production dependencies.
FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci --omit=dev --workspace=api --include-workspace-root \
    && npm cache clean --force

COPY api/src api/src

# The mock LMS client reads this schema at runtime to validate payloads the same
# way the real LMS does, so it is application data, not a test fixture.
COPY contract/ contract/

# api/src/index.js resolves the built app relative to its own file
# (../../web/dist/web/browser), so this layout is load-bearing, not cosmetic.
COPY --from=build /app/web/dist/web/browser web/dist/web/browser

# Mock mode by default — no LMS, no token, nothing to configure. Set both
# LMS_BASE_URL and LMS_API_TOKEN at run time to talk to a real cbr-api2.
EXPOSE 3000
USER node
CMD ["node", "api/src/index.js"]
