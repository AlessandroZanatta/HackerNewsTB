FROM node:14

# Create app directory
WORKDIR /usr/src/app

# Copy and install dependencies
COPY package*.json ./
RUN npm install

# Copy sources
COPY src/ ./

# Start bot
CMD [ "node", "bot.js" ]
