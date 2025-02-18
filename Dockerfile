# syntax=docker/dockerfile:1

ARG NODE_VERSION=22.12.0

FROM node:${NODE_VERSION}-alpine

ENV NODE_ENV production


WORKDIR /usr/src/app

# Copy package files first for better caching
COPY package*.json ./

# Install global dependencies
RUN npm i -g nodemon

RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=package-lock.json,target=package-lock.json \
    --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev


COPY . .
USER node

EXPOSE 9000

CMD ["npm", "run", "dev"]
