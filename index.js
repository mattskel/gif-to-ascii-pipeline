import express from 'express';
import axios from 'axios';
import 'dotenv/config'
import path from 'path';
import http from 'http';
import {Server} from 'socket.io';
import myTransform from './app.js'

const app = express();
const server = http.createServer(app);
const __dirname = path.resolve();
const io = new Server(server);

app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.get('/submit', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8'); 
  const limit = 25;
  const {searchTerm} = req.query;
  axios.get(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${searchTerm}&limit=${limit}`)
    .then((response) => {
      if (response.status !== 200) {
        // Something went wrong
        res.status(500).send({ error: 'Somethign went wrong' })
        res.end();
        return;
      }
      const {data} = response.data;
      if (!Array.isArray(data) || data.length === 0) {
        res.status(404).send({ error: 'No gifs found' });
        return;
      }
      const {id} = data[Math.floor(Math.random() * Math.min(data.length, limit))];
      myTransform(`https://media.giphy.com/media/${id}/giphy.gif`, res, io)
    })
    .catch((err) => {
      console.log('Giphy request failed:', err.message);
      if (!res.headersSent) {
        res.status(502).send({ error: 'Could not reach Giphy' });
      }
    });

})

server.listen(process.env.port || 3000, () => {
  console.log('listening on *:3000');
});
