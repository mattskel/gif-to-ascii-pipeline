
var socket = io();
var textArea = document.getElementById('whereTheTextGoes');
var imgElement = document.getElementById('image');
var gifForm = document.getElementById('gifForm');
var errorMessage = document.getElementById('errorMessage');
let timeoutId;
let colorUrls = [];
let frames = [];

function loopAnimation(frames, delays) {
  var i = 0;
  var loop = function() {
    textArea.textContent = frames[i];
    const url = colorUrls[i];
    if (url) {
      imgElement.src = url;
    }
    timeoutId = setTimeout(loop, delays[i] * 10);
    i = (i + 1) % frames.length;
  }
  loop();
}

function stopAnimation(timeoutId) {
  if (timeoutId) {
    clearTimeout(timeoutId);
  }
  timeoutId = undefined;
}

gifForm.addEventListener('submit', function(event) {
  event.preventDefault();

  // Remove the error message if it exists
  errorMessage.setAttribute('hidden', 'hidden')

  // Stop the animation currently running
  stopAnimation(timeoutId);

  // disable the form so that it can't be changed while we're sending
  // And reset the frame arrays to empty
  gifForm.elements.searchTerm.disabled = true;
  gifForm.elements.send.disabled = true;
  colorUrls = [];
  frames = [];
  const formElement = event.target;
  const {value: searchTerm} = formElement.querySelector('input[name="searchTerm"]')

  let prevBuffer;
  fetch(`/submit?searchTerm=${searchTerm}`, {
    method: 'GET',
  })
    .then((response) => {
      if (response.status !== 200) {
        throw new Error('Something went wrong on the server!');
        errorMessage.removeAttribute('hidden')
      }

      return response.json();
    })
    .then((data) => {
      loopAnimation(frames, data);
      gifForm.elements.searchTerm.disabled = false;
      gifForm.elements.send.disabled = false;
    })
    .catch((error) => {
      // enable the form again
      gifForm.elements.searchTerm.disabled = false;
      gifForm.elements.send.disabled = false;
    });
})

socket.on('asciiFrame', (frame) => {
  frames.push(frame);
  textArea.textContent = frame;
  const url = colorUrls[frames.length - 1];
  if (url) {
    imgElement.src = url;
  }
});

socket.on('colorFrame', (url) => {
  colorUrls.push(url);
  if (colorUrls.length === frames.length) {
    imgElement.src = url;
  }
});

