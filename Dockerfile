# Use official Node.js image as a base
FROM node:20

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json to leverage Docker cache
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application files
COPY . .

# Build the NestJS app
RUN npm run build

# Expose the port the app will run on
EXPOSE 3000

# Run the app
CMD ["npm", "run", "start:prod"]