import express from 'express';
import axios from 'axios';
import 'dotenv/config'
import bodyParser from 'body-parser';
import path from 'path';
import http from 'http';
import {Server} from 'socket.io';
import myTransform from './app.js'

const app = express();
const server = http.createServer(app);
const __dirname = path.resolve();
const io = new Server(server);

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.get('/submit', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
  });
  const limit = 25;
  const {searchTerm} = req.query;
  axios.get(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${searchTerm}&limit=${limit}`)
    .then((response) => {
      if (response.status !== 200) {
        // Something went wrong
      }

      const {data} = response.data;
      console.log('data.length', data.length);
      const {id} = data[Math.floor(Math.random() * Math.min(data.length, limit))];
      console.log(id);
      myTransform(`https://media.giphy.com/media/${id}/giphy.gif`, res, io)
    });

})

server.listen(3000, () => {
  console.log('listening on *:3000');
});