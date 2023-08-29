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
  res.sendFile(__dirname + '/index.html');
  // myTransform('https://media.giphy.com/media/p05Cn7nC8x2Jq/giphy.gif',res, io)
});

// let transform;
app.get('/submit', (req, res) => {
  // transform = undefined;
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
      // const id = '3o72FfM5HJydzafgUE'; // fire
      // const id = 'v6aOjy0Qo1fIA' // cat; Not working for greyscale
      // const id = '26n7aDOiWJJckm2pq'; // dolphin Not working at all
      // const id = 'IL5j1z69Qi7NTLTL7j'; // eat drink enjoy
      // const id = 'CiTLZWskt7Fu'; // Nick Cage Con air
      // const id = 'U3PFGB8kCBVf7EN4Fk'; // Dog splits not working
      // const id = 'OLH834Zo34k9O'; // Jerri Blank fix for Application header
      // const id = '11mwBM4qjFBBwA'; // Nirvana
      // const id = '8vQSQ3cNXuDGo'
      // const id = '3pZipqyo1sqHDfJGtz'; // Elmo. Might need to test this one...
      // const id = 'L2VTMlN4SqWlO'; // Plasmo... Nuff said
      // const id = 'nR4L10XlJcSeQ'
      console.log(id);
      myTransform(`https://media.giphy.com/media/${id}/giphy.gif`, res, io)
    });

})

// app.get('/gif', (req) => {
//   myTransform('https://media.giphy.com/media/vz0K0DWTspyQmDS7Tv/giphy.gif', io)
// })

server.listen(3000, () => {
  console.log('listening on *:3000');
});