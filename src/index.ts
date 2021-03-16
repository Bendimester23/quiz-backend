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
    origin: `http://quiz.bendimester23.tk`,
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
    id: socket.id,
    answers: [],
    points: 0
  }
  socket.emit(`changestate`, state)
  console.log(`Socket connected.\nID: ${socket.id}`)
  socket.on(`checkstate`, (data) => {
    if (kicked.includes(socket.id)) {
      console.log(`cucc`)
      socket.emit(`changestate`, {
        isStarted: false,
        isReady: false,
        isEnded: false
      })
      return
    }
    socket.emit(`changestate`, state)
  })
  socket.on(`disconnect`, () => {
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

  socket.on(`reset_quiz`, () => {
    if (!dash.includes(socket.id)) return
    state = {
      isEnded: false,
      isReady: false,
      isStarted: false
    }
    currentQuestion = 0
    if (tick) clearInterval(tick)
    qState = 0
    Object.values(sockets).forEach((v: any) => {
      if (v === undefined) return
      v.name = ``
      v.isReady = false
    })
    io.emit(`update_players`, [])
    socket.emit(`changestate`, state)
    io.emit(`waiting`, {
      notReadyPlayers: 0
    })
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
      io.emit(`update_players`, [])
    }
    io.emit(`changestate`, state)
  })

  socket.on(`dash`, () => {
    dash.push(socket.id)
  })

  socket.on(`answer`, (data) => {
    if (sockets[socket.id]?.answers[currentQuestion]?.has) return
    sockets[socket.id].answers[currentQuestion] = {
      answer: data,
      hasAnswer: true,
      time: cooldown
    }
    if (quizdata[currentQuestion].right == data) sockets[socket.id].points += cooldown
    socket.emit(`updatequestion`, quizdata[currentQuestion])
  })

  socket.on(`ready`, (data) => {
    let { name } = data;
    if (Object.values(sockets).find((e: any) => e?.name == data.name)) {
      name = name + Math.round(Math.random() * 1000)
    }
    sockets[socket.id] = {
      name: name,
      isReady: true,
      id: socket.id,
      answers: [],
      points: 0
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
    const { answers, title } = quizdata[currentQuestion]
    socket.emit(`updatequestion`, {
      answers: answers,
      title: title,
      facts: ["", "", "", ""]
    })
  })
})
let cooldown = 5;

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
          if (currentQuestion >= quizdata.length) {
            qState = 2
            state.isEnded = true
            io.emit(`setCurrState`, 2)
            io.emit(`setCurrState`, 2)
            console.log(`cucc`);

            let top3 = Object.values(sockets).filter((e: any) => e.isReady)
            top3.sort((a: any, b: any) => a.score - b.score)
            top3.forEach((e: any) => {
              console.log(`Name: ${e.name} Points: ${e.points}`);

            })
            io.emit(`top`, top3)
            clearInterval(tick)
          } else {
            io.emit(`annuance`, currentQuestion + 1)
            qState++
          }
        }
        break
      case 1:
        io.emit(`setCurrState`, 1)
        cooldown = 10
        io.emit(`update-countdown`, cooldown)
        if (quizdata[currentQuestion] == undefined) {
          qState = 3
          state.isEnded = true
          io.emit(`setCurrState`, 2)
          return
        }
        const { answers, title } = quizdata[currentQuestion]
        io.emit(`updatequestion`, {
          answers: answers,
          title: title,
          facts: ["", "", "", ""]
        })
        qState++
        break
      case 2:
        if (cooldown >= 1) {
          cooldown--
          io.emit(`update-countdown`, cooldown)
        } else {
          const arr = Object.values(sockets);
          for (let i = 0; i < arr.length; i++) {
            const s: any = arr[i];
            handleAnswers(s)
          }
          currentQuestion++
          cooldown = 5
          qState = 0
          io.emit(`setCurrState`, 0)
        }
        break
      case 3:
        state.isEnded = true
        io.emit(`setCurrState`, 2)
        console.log(`cucc`);

        let top3 = Object.values(sockets).filter((e: any) => e.isReady)
        top3.sort((a: any, b: any) => a.score - b.score)
        top3.forEach((e: any) => {
          console.log(`Name: ${e.name} Points: ${e.points}`);

        })
        io.emit(`top`, top3)
    }
  }, 1000)
}

function handleAnswers(s: any) {
  if (s == null || s == undefined) return
  if (kicked.includes(s.id)) return
  if (dash.includes(s.id)) return
  if (!s.isReady) return
  if (s.answers[currentQuestion] == undefined) {
    s.answers[currentQuestion] = {
      answer: -1,
      hasAnswer: false,
      time: 0
    }
  }
}

server.listen(3000, () => {
  console.log(`Listening`)
})
