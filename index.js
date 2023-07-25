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

// app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  // res.send('<h1>Hello world</h1>');
  res.sendFile(__dirname + '/index.html');
  // myTransform('https://media.giphy.com/media/vz0K0DWTspyQmDS7Tv/giphy.gif', io)
});

// let transform;
app.get('/submit', (req, res) => {
  // transform = undefined;
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
  });
  const {searchTerm} = req.query;
  axios.get(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${searchTerm}&limit=10`)
    .then((response) => {
      if (response.status !== 200) {
        // Something went wrong
      }

      const {data} = response.data;
      // const {id} = data[Math.floor(Math.random() * 10)];
      // console.log(id);
      const id = '3o72FfM5HJydzafgUE'; // fire
      // const id = 'v6aOjy0Qo1fIA' // cat;
      myTransform(`https://media.giphy.com/media/${id}/giphy.gif`, res, io)
    });

})

// app.get('/gif', (req) => {
//   myTransform('https://media.giphy.com/media/vz0K0DWTspyQmDS7Tv/giphy.gif', io)
// })

server.listen(3000, () => {
  console.log('listening on *:3000');
});