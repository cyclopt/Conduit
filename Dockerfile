FROM node:fermium

ARG BUILDING_SERVICE

COPY . /app

WORKDIR /app

RUN apt update && \
    curl -OL https://github.com/google/protobuf/releases/download/v3.17.3/protoc-3.17.3-linux-x86_64.zip && \
    unzip -o ./protoc-3.17.3-linux-x86_64.zip -d /usr/local bin/protoc && \
    unzip -o ./protoc-3.17.3-linux-x86_64.zip -d /usr/local include/* && \
    rm -f protoc-3.17.3-linux-x86_64.zip

RUN npm install -g node-gyp ts-proto

RUN yarn && \
    npx lerna run build --scope=@conduitplatform/conduit-grpc-sdk

RUN if [  -z "$BUILDING_SERVICE" ] ; then npx lerna run build ;  \
    elif [ "$BUILDING_SERVICE" = "conduit" ] ; then npx lerna run build --scope=@conduitplatform/conduit-admin \
    --scope=@conduitplatform/conduit-commons --scope=@conduitplatform/conduit-config \
    --scope=@conduitplatform/core --scope=@conduitplatform/conduit-router --scope=@conduitplatform/conduit-security ; \
    else cd /app/$BUILDING_SERVICE && yarn build && cd /app ; fi

RUN npx lerna clean -y && rm -rf node_modules
