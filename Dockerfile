FROM node:20

WORKDIR /app

COPY . .

RUN npm install -g pnpm
RUN pnpm install

# # Run Prisma commands using npx
# RUN npx prisma generate
# RUN npx prisma migrate deploy

CMD ["npm", "run", "start:dev"]