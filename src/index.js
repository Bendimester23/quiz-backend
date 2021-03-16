"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
exports.__esModule = true;
var express_1 = __importDefault(require("express"));
var helmet_1 = __importDefault(require("helmet"));
var cors_1 = __importDefault(require("cors"));
var socket_io_1 = require("socket.io");
var http_1 = require("http");
var data_json_1 = __importDefault(require("../data.json"));
var currentQuestion = 0;
var sockets = {};
var dash = [];
var kicked = [];
var app = express_1["default"]();
var server = http_1.createServer(app);
var io = new socket_io_1.Server(server, {
    cors: {
        origin: "http://192.168.8.100:8080",
        allowedHeaders: "*",
        credentials: true
    },
    allowEIO3: true
});
var state = {
    isStarted: false,
    isReady: false,
    isEnded: false
};
var tick;
app.use(helmet_1["default"]());
app.use(cors_1["default"]());
io.on("connect", function (socket) {
    sockets[socket.id] = {
        name: "",
        isReady: false,
        id: socket.id,
        answers: [],
        points: 0
    };
    socket.emit("changestate", state);
    console.log("Socket connected.\nID: " + socket.id);
    socket.on("checkstate", function (data) {
        if (kicked.includes(socket.id)) {
            console.log("cucc");
            socket.emit("changestate", {
                isStarted: false,
                isReady: false,
                isEnded: false
            });
            return;
        }
        socket.emit("changestate", state);
    });
    socket.on("disconnect", function () {
        var left = 0;
        Object.values(sockets).forEach(function (e) {
            if (e != undefined && !e.isReady && !dash.includes(e.id))
                left++;
        });
        io.emit("waiting", {
            notReadyPlayers: left
        });
        sockets[socket.id] = undefined;
        console.log("Socket Disconnected.\nID: " + socket.id);
        var playerNames = [];
        Object.values(sockets).forEach(function (e) {
            if (e != undefined && e.isReady && !dash.includes(e.id))
                playerNames.push(e.name);
        });
        io.emit("update_players", playerNames);
    });
    socket.on("kick_player", function (data) {
        var id = Object.values(sockets).find(function (e) { return (e === null || e === void 0 ? void 0 : e.name) == data; }).id;
        kicked.push(id);
        io.to(id).emit("changestate", {
            isStarted: false,
            isReady: false
        });
        sockets[id] = undefined;
        var playerNames = [];
        Object.values(sockets).forEach(function (e) {
            if (e != undefined && e.isReady && !dash.includes(e.id))
                playerNames.push(e.name);
        });
        io.emit("update_players", playerNames);
    });
    socket.on("querry_players", function (data) {
        var playerNames = [];
        Object.values(sockets).forEach(function (e) {
            if (e != undefined && e.isReady && !dash.includes(e.id))
                playerNames.push(e.name);
        });
        io.emit("update_players", playerNames);
    });
    socket.on("reset_quiz", function () {
        if (!dash.includes(socket.id))
            return;
        state = {
            isEnded: false,
            isReady: false,
            isStarted: false
        };
        currentQuestion = 0;
        if (tick)
            clearInterval(tick);
        qState = 0;
        Object.values(sockets).forEach(function (v) {
            if (v === undefined)
                return;
            v.name = "";
            v.isReady = false;
        });
        io.emit("update_players", []);
        socket.emit("changestate", state);
        io.emit("waiting", {
            notReadyPlayers: 0
        });
    });
    socket.on("setquizstate", function (data) {
        if (!dash.includes(socket.id)) {
            dash.push(socket.id);
        }
        state = data;
        if (!state.isReady && state.isStarted) {
            var left_1 = 0;
            Object.values(sockets).forEach(function (e) {
                if (e != undefined && !e.isReady && !dash.includes(e.id))
                    left_1++;
            });
            io.emit("waiting", {
                notReadyPlayers: left_1
            });
        }
        else if (!state.isReady && !state.isStarted) {
            io.emit("waiting", {
                notReadyPlayers: 0
            });
            io.emit("update_players", []);
        }
        io.emit("changestate", state);
    });
    socket.on("dash", function () {
        dash.push(socket.id);
    });
    socket.on("answer", function (data) {
        var _a, _b;
        if ((_b = (_a = sockets[socket.id]) === null || _a === void 0 ? void 0 : _a.answers[currentQuestion]) === null || _b === void 0 ? void 0 : _b.has)
            return;
        sockets[socket.id].answers[currentQuestion] = {
            answer: data,
            hasAnswer: true,
            time: cooldown
        };
        if (data_json_1["default"][currentQuestion].right == data)
            sockets[socket.id].points += cooldown;
        socket.emit("updatequestion", data_json_1["default"][currentQuestion]);
    });
    socket.on("ready", function (data) {
        var name = data.name;
        if (Object.values(sockets).find(function (e) { return (e === null || e === void 0 ? void 0 : e.name) == data.name; })) {
            name = name + Math.round(Math.random() * 1000);
        }
        sockets[socket.id] = {
            name: name,
            isReady: true,
            id: socket.id,
            answers: [],
            points: 0
        };
        var left = 0;
        Object.values(sockets).forEach(function (e) {
            if (e != undefined && !e.isReady && !dash.includes(e.id))
                left++;
        });
        var playerNames = [];
        Object.values(sockets).forEach(function (e) {
            if (e != undefined && e.isReady && !dash.includes(e.id))
                playerNames.push(e.name);
        });
        io.emit("update_players", playerNames);
        io.emit("waiting", {
            notReadyPlayers: left
        });
        if (left === 0)
            startQuiz();
    });
    socket.on("getquestion", function (data) {
        var _a = data_json_1["default"][currentQuestion], answers = _a.answers, title = _a.title;
        socket.emit("updatequestion", {
            answers: answers,
            title: title,
            facts: ["", "", "", ""]
        });
    });
});
var cooldown = 5;
var qState = 0;
function startQuiz() {
    console.log("Starting quiz with " + io.sockets.sockets.size + " users");
    state = {
        isStarted: true,
        isReady: true,
        isEnded: false
    };
    io.emit("changestate", state);
    io.emit("setcooldown", true);
    tick = setInterval(function () {
        switch (qState) {
            case 0:
                io.emit("setCurrState", 0);
                if (cooldown >= 1) {
                    cooldown--;
                    io.emit("update-countdown", cooldown);
                }
                else {
                    if (currentQuestion >= data_json_1["default"].length) {
                        qState = 2;
                        state.isEnded = true;
                        io.emit("setCurrState", 2);
                        io.emit("setCurrState", 2);
                        console.log("cucc");
                        var top3_1 = Object.values(sockets).filter(function (e) { return e.isReady; });
                        top3_1.sort(function (a, b) { return a.score - b.score; });
                        top3_1.forEach(function (e) {
                            console.log("Name: " + e.name + " Points: " + e.points);
                        });
                        io.emit("top", top3_1);
                        clearInterval(tick);
                    }
                    else {
                        io.emit("annuance", currentQuestion + 1);
                        qState++;
                    }
                }
                break;
            case 1:
                io.emit("setCurrState", 1);
                cooldown = 10;
                io.emit("update-countdown", cooldown);
                if (data_json_1["default"][currentQuestion] == undefined) {
                    qState = 3;
                    state.isEnded = true;
                    io.emit("setCurrState", 2);
                    return;
                }
                var _a = data_json_1["default"][currentQuestion], answers = _a.answers, title = _a.title;
                io.emit("updatequestion", {
                    answers: answers,
                    title: title,
                    facts: ["", "", "", ""]
                });
                qState++;
                break;
            case 2:
                if (cooldown >= 1) {
                    cooldown--;
                    io.emit("update-countdown", cooldown);
                }
                else {
                    var arr = Object.values(sockets);
                    for (var i = 0; i < arr.length; i++) {
                        var s = arr[i];
                        handleAnswers(s);
                    }
                    currentQuestion++;
                    cooldown = 5;
                    qState = 0;
                    io.emit("setCurrState", 0);
                }
                break;
            case 3:
                state.isEnded = true;
                io.emit("setCurrState", 2);
                console.log("cucc");
                var top3 = Object.values(sockets).filter(function (e) { return e.isReady; });
                top3.sort(function (a, b) { return a.score - b.score; });
                top3.forEach(function (e) {
                    console.log("Name: " + e.name + " Points: " + e.points);
                });
                io.emit("top", top3);
        }
    }, 1000);
}
function handleAnswers(s) {
    if (s == null || s == undefined)
        return;
    if (kicked.includes(s.id))
        return;
    if (dash.includes(s.id))
        return;
    if (!s.isReady)
        return;
    if (s.answers[currentQuestion] == undefined) {
        s.answers[currentQuestion] = {
            answer: -1,
            hasAnswer: false,
            time: 0
        };
    }
}
server.listen(3000, function () {
    console.log("Listening");
});
