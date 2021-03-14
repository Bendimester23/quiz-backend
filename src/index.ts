import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import { Server as SocketIOServer, Socket } from "socket.io";
import { createServer, Server as HTTPServer } from "http";
import quizdata from '../data.json'

let currentQuestion = 0;

const sockets = {}

const dash = []

const kicked = []

const app = express()
const server: HTTPServer = createServer(app)
const io: SocketIOServer = new SocketIOServer(server, {
  cors: {
    origin: `http://192.168.8.100:8080`,
    allowedHeaders: `*`,
    credentials: true
  },
  allowEIO3: true
});

let state = {
  isStarted: false,
  isReady: false,
  isEnded: false
}

let tick;

app.use(helmet())
app.use(cors())

io.on(`connect`, (socket: Socket) => {
  sockets[socket.id] = {
    name: ``,
    isReady: false,
    id: socket.id
  }
  socket.emit(`changestate`, state)
  console.log(`Socket connected.\nID: ${socket.id}`)
  socket.on(`checkstate`, (data) => {
    if (kicked.includes(socket.id)) {
      socket.emit(`changestate`, {
        isStarted: false,
        isReady: false
      })
      return
    }
    socket.emit(`changestate`, state)
  })
  socket.on(`disconnect`, (data) => {
    let left = 0
    Object.values(sockets).forEach((e: any) => {
      if (e != undefined && !e.isReady && !dash.includes(e.id)) left++
    })
    io.emit(`waiting`, {
      notReadyPlayers: left
    })
    sockets[socket.id] = undefined
    console.log(`Socket Disconnected.\nID: ${socket.id}`)
    let playerNames = []
    Object.values(sockets).forEach((e: any) => {
      if (e != undefined && e.isReady && !dash.includes(e.id)) playerNames.push(e.name)
    })
    io.emit(`update_players`, playerNames)
  })

  socket.on(`kick_player`, (data) => {
    const id = (Object.values(sockets).find((e: any) => e?.name == data) as any).id
    kicked.push(id)
    io.to(id).emit(`changestate`, {
      isStarted: false,
      isReady: false
    })
    sockets[id] = undefined
    let playerNames = []
    Object.values(sockets).forEach((e: any) => {
      if (e != undefined && e.isReady && !dash.includes(e.id)) playerNames.push(e.name)
    })
    io.emit(`update_players`, playerNames)
  })

  socket.on(`querry_players`, (data) => {
    let playerNames = []
    Object.values(sockets).forEach((e: any) => {
      if (e != undefined && e.isReady && !dash.includes(e.id)) playerNames.push(e.name)
    })
    io.emit(`update_players`, playerNames)
  })

  socket.on(`setquizstate`, (data) => {
    if (!dash.includes(socket.id)) {
      dash.push(socket.id)
    }
    state = data
    if (!state.isReady && state.isStarted) {
      let left = 0
      Object.values(sockets).forEach((e: any) => {
        if (e != undefined && !e.isReady && !dash.includes(e.id)) left++
      })
      io.emit(`waiting`, {
        notReadyPlayers: left
      })
    } else if (!state.isReady && !state.isStarted) {
      io.emit(`waiting`, {
        notReadyPlayers: 0
      })
    }
    io.emit(`changestate`, state)
  })

  socket.on(`dash`, () => {
    dash.push(socket.id)
  })

  socket.on(`ready`, (data) => {
    let { name } = data;
    if (Object.values(sockets).find((e: any) => e?.name == data.name)) {
      name = name + Math.round(Math.random() * 1000)
    }
    sockets[socket.id] = {
      name: name,
      isReady: true,
      id: socket.id
    }
    let left = 0
    Object.values(sockets).forEach((e: any) => {
      if (e != undefined && !e.isReady && !dash.includes(e.id)) left++
    })

    let playerNames = []
    Object.values(sockets).forEach((e: any) => {
      if (e != undefined && e.isReady && !dash.includes(e.id)) playerNames.push(e.name)
    })
    io.emit(`update_players`, playerNames)
    io.emit(`waiting`, {
      notReadyPlayers: left
    })
    if (left === 0) startQuiz()
  })

  socket.on(`getquestion`, (data) => {
    socket.emit(`updatequestion`, quizdata[currentQuestion])
  })
})
let cooldown = 3;

let qState = 0

function startQuiz() {
  console.log(`Starting quiz with ${io.sockets.sockets.size} users`)
  state = {
    isStarted: true,
    isReady: true,
    isEnded: false
  }
  io.emit(`changestate`, state)
  io.emit(`setcooldown`, true)
  tick = setInterval(() => {
    switch (qState) {
      case 0:
        io.emit(`setCurrState`, 0)
        if (cooldown >= 1) {
          cooldown--
          io.emit(`update-countdown`, cooldown)
        } else {
          io.emit(`annuance`, currentQuestion + 1)
          qState++
        }
        break
      case 1:
        io.emit(`setCurrState`, 1)
        cooldown = 10
        io.emit(`updatequestion`, quizdata[currentQuestion])
        qState++
        break
      case 2:
        if (cooldown >= 1) {
          cooldown--
          io.emit(`update-countdown`, cooldown)
        } else {
          currentQuestion++
          console.log(`Curr: ${currentQuestion} max: ${quizdata.length}`)
          if (currentQuestion >= quizdata.length) {
            qState++
          } else {
            qState = 0
          }
        }
        break
      case 3:
        state.isEnded = true
        io.emit(`setCurrState`, 2)
    }
  }, 1000)
}

server.listen(3000, () => {
  console.log(`Listening`)
})
