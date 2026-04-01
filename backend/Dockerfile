# Use Node image
FROM node:22

# Create app directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Expose port
EXPOSE 3618

# Run app
CMD ["npm", "start"]
