# Stage 1: Build the Vite React app
FROM node:22-alpine AS build

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Build the app
COPY . .
RUN npm run build

# Stage 2: Serve the build output with lightweight Nginx server
FROM nginx:alpine

# Copy the built HTML/JS/CSS to Nginx
COPY --from=build /app/dist /usr/share/nginx/html

# Replace standard default.conf to support client-side routing (React Router etc.)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port and start
EXPOSE 6969
CMD ["nginx", "-g", "daemon off;"]
