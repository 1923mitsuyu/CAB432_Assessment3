FROM --platform=$TARGETPLATFORM node:22-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package*.json ./
RUN npm ci

RUN npm install @aws-sdk/client-secrets-manager
RUN npm install sqlite3 --save
RUN npm install @aws-sdk/client-ssm
RUN npm install @aws-sdk/s3-request-presigner
RUN npm install @aws-sdk/client-s3
RUN npm install @aws-sdk/client-cognito-identity-provider
RUN npm install aws-jwt-verify

COPY . .

EXPOSE 3001
EXPOSE 3002

CMD ["node", "app.js"]