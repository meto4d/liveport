"use strict"
import { Component, Watch } from "vue-typed"
import { DataSource } from "./DataSource";
import { Shitaraba } from "./Shitaraba";
import { Nichan } from "./Nichan";
import { Twitch } from "./Twitch";
import { VOICE } from "./Voice"
import ProvideManager from "./ProvideManager";
import { configure } from "./Configure"
const LETTER: string = configure.letter;
const CustomCss = configure.CustomCss;
import { remote, ipcRenderer } from "electron";
const ApplicatonName = require("../../../package.json").name
const VERSION = require("../../../package.json").version
const port: number = configure.port
import * as $ from "jquery"
import * as fs from "fs";
const SETTINGS = "settings";
enum KEY {
    CTRL = 1, SHIFT = 2, NONE = 3
}

@Component({})
export default class Application {
    pManager: ProvideManager;
    testMessage: string = 'このテキストはテストメッセージです';
    url: string = "";
    processing: boolean = false;
    thread: DataSource;
    dataSources = [Shitaraba, Twitch, Nichan];

    constructor() {
        console.log("hello application.");
        this.init();
    }

    // dat取得
    reload: number = 10;
    // dat取得タイマーId
    reloadTimerID: number;
    // dat取得カウントダウン
    reloadTimerCountDown: number = this.reload;
    newArrival = 0;
    startThreadRequest() {
        if (!this.processing) return;
        this.reloadTimerCountDown = this.reload;
        this.getBbsTitle();
        this.thread.request(
            (newArrival: number) => {
                console.log("request success", newArrival.toString());
                this.newArrival = newArrival;
                this.setRequestTimer();
            },
            (err: any) => {
                console.log("request failed", err);
                let warn = {
                    message: "ERROR : " + err,
                    timeout: 1500
                }
                this.snackbar(warn);
                this.setRequestTimer();
            }
        )
    }

    stopThreadRequest() {
        clearTimeout(this.reloadTimerID);
    }

    setRequestTimer() {
        if (!this.processing) return;
        if (this.reloadTimerCountDown < 0) {
            this.startThreadRequest();
        } else {
            this.reloadTimerID = window.setTimeout(() => {
                this.reloadTimerCountDown--;
                this.setRequestTimer();
            }, 1000);
        }
    }

    provideStatus = "idle";
    provideTimeLimit = 10;
    provideTimerID = null;
    lastProvideStart = 0;
    startProvide() {
        if (!this.processing)
            return;

        if (this.pManager.speaker.speaking()) {
            this.provideStatus = "busy";
            if (+new Date() - this.lastProvideStart >= this.provideTimeLimit*1000) {
                this.pManager.cancel();
            }
            this.provideTimerID = setTimeout(() => {
                this.startProvide();
            }, 1000);
        } else {
            this.provideStatus = "idle";
            let provide = () => {
                if (!this.processing) return;
                let target = this.thread.messages[this.thread.bookmark];

                const letter = this.interpolateLetter(target.num);

                this.lastProvideStart = +new Date();
                this.pManager.provide(letter + ":", target.text, this.pManager.reading, this.provideTimeLimit);
                this.thread.next();
                if (this.autoScroll)
                    this.scrollTo(this.thread.bookmark);

                this.provideTimerID = setTimeout(() => {
                    this.startProvide();
                }, 1000);
            }
            if (this.thread.bookmark != this.thread.allNum()) {
                if (this.playingNotificationSound)
                    this.notificationSound(provide);
                else
                    provide();
            } else {
                this.haltProvide();
                this.provideTimerID = setTimeout(() => {
                    this.startProvide();
                }, 1000);
            }
        }
    }

    interpolateLetter(num: number) {
        let tmpLetter = LETTER.split("$1");
        return tmpLetter.length > 1 ?
            tmpLetter[0] + num + tmpLetter[1]
            : num.toString();
    }

    stopProvide() {
        clearTimeout(this.provideTimerID);
        this.haltProvide();
        this.provideStatus = "idle";
    }
    haltProvide() {
        this.pManager.cancel();
        this.provideDummyText();
    }

    start() {
        this.processing = true;
        if (!this.validate()) {
            this.processing = false;
            return;
        }

        if (!this.isValidThreadUrl() && this.isValidBbsUrl()) {
            this.showLists();
            this.processing = false;
            return;
        }

        if (this.thread) {
            if (this.url != this.thread.url) {
                this.loadUrlSource();
            }
        } else {
            this.loadUrlSource();
        }
        if (this.autoScroll)
            this.latest();
        this.startThreadRequest();
        this.pManager.selectVoice(this.path);
        this.startProvide();
    }

    handle(e) {
        console.log(e)
    }

    validate(): boolean {
        if (this.usingPath() && this.path === "" && this.pManager.reading && this.processing === true) {
            let warn = {
                message: "ERROR : pathが設定されていません。", timeout: 1500
            }
            this.snackbar(warn);
            return false;
        }
        if (
            (/.*\vrx.exe$/.test(this.path) && (this.pManager.voice != VOICE.TAMIYASU)) ||
            (/.*\SofTalk.exe$/.test(this.path) && (this.pManager.voice != VOICE.SOFTALK)) ||
            (/.*\RemoteTalk.exe$/.test(this.path) && (this.pManager.voice != VOICE.BOUYOMI))
        ) {
            let warn = {
                message: "WARN : 読み上げソフトの指定を間違っている可能性があります", timeout: 1000
            }
            this.snackbar(warn);
        }

        if (!this.isValidURL()) {
            let warn = {
                message: "ERROR : 対応していないURLです", timeout: 1500
            }
            this.snackbar(warn);
            return false;
        }
        return true;
    }

    usingPath(): boolean {
        return this.pManager.voice === VOICE.SOFTALK || this.pManager.voice === VOICE.TAMIYASU || this.pManager.voice === VOICE.BOUYOMI;
    }

    requestOnce(load: boolean = false) {
        console.log("requestOnce", this.url);
        this.stop();
        if (this.isValidThreadUrl()) {
            this.showListView = false;
            this.loadUrlSource(load);
            if (load) this.initScroll();
            this.snackbar({ message: "読み込みを開始しました" });
            this.getBbsTitle();
            this.thread.request(
                (newArrival: number) => {
                    this.snackbar({ message: "読み込みに成功しました" });
                    console.log("request success", newArrival.toString());
                },
                (err: any) => {
                    console.log("request failed", err);
                    let warn = {
                        message: "ERROR : " + err, timeout: 1500
                    }
                    this.snackbar(warn);
                }
            );
        } else if (this.isValidBbsUrl()) {
            this.showLists();
        } else {
            return;
        }
    }

    getBbsTitle() {
        if (this.thread.parentTitle) return;
        this.thread.getSetting(
            () => { },
            (err: any) => {
                console.log("request failed", err);
                this.thread.parentTitle = "メインタイトルの取得に失敗しました"
            }
        );
    }

    stop() {
        this.processing = false;
        this.stopThreadRequest();
        this.stopProvide();
    }

    showLists() {
        this.showListView = true;

        if (!this.isValidURL()) {
            this.snackbar({ message: "URLが正しくありません" });
            return;
        }
        
        // if (this.isValidBbsUrl()) {
        //     for (var ds of this.dataSources) {
        //         if (ds.isValidBbsUrl(this.url)) {
        //             this.thread = new ds(this.url);
        //             break;
        //         }
        //     }
        // }

        this.snackbar({ message: "一覧の読み込みを開始" });
        this.thread.getLists(() => {
            this.snackbar({ message: "一覧の読み込みに成功" });
        }, (err) => {
            this.snackbar({ message: err, timeout: 1500 });
        });
    }

    flipShowListMode() {
        if (this.showListView) {
            this.showListView = false;
            this.initScroll();
        } else {
            this.showLists();
        }
    }
    showListView = false;

    setUrlFromShowList(url: string) {
        this.url = url;
        this.requestOnce(true);
    }

    sendKey = KEY.SHIFT;
    sendMessage(sendKey?: number) {
        if (this.sendKey === sendKey || !sendKey) {
            console.log("start send request");
            this.snackbar({ message: "書き込み開始" });
            if (!this.comment.MESSAGE) return;
            if (this.url != this.thread.url) {
                this.loadUrlSource();
            }
            const message = {
                NAME: this.comment.NAME, MAIL: this.comment.MAIL, MESSAGE: this.comment.MESSAGE
            }
            this.thread.sendMessage(message, (result: string) => {
                this.snackbar({ message: result });
                this.comment.MESSAGE = "";
            }, (err) => {
                this.snackbar({ message: err });
            });
        }
    }

    showCommentView = false;
    flipCommentMode() {
        this.showCommentView = !this.showCommentView;
        if (this.showCommentView) {
            this.initScroll();
        }
    }

    comment = {
        MAIL: "",
        NAME: "",
        MESSAGE: ""
    }

    get validThreadControlls() {
        return !this.isValidThreadUrl() || this.showListView;
    }

    get validUrl() {
        return this.isValidURL();
    }

    latest() {
        this.thread.latest();
        this.scrollTo(this.thread.bookmark);
    }

    dummyText: string = "";
    provideDummyText() {
        this.pManager.dummyText(this.dummyText);
    }

    dummyTextTemp: string = "";
    insertDummyText() {
        this.dummyText = this.dummyTextTemp;
        if (!this.processing)
            this.pManager.dummyText(this.dummyText);
    }

    showDummyTextWindow() {
        var dialog: any = document.querySelector("#subtitling");
        dialog.showModal();
        dialog.querySelector('.close').addEventListener('click', () => {
            dialog.close();
        });
    }

    snackbar(data: { message: string, timeout?: number } = { message: "info", timeout: 750 }) {
        var snackbarContainer: any = document.querySelector('#snackbar');
        if (!data.timeout) data.timeout = 750;
        if (snackbarContainer)
            snackbarContainer.MaterialSnackbar.showSnackbar(data);
        else
            console.log(data.message);
    }

    autoScroll: boolean = false;
    flipAutoScroll() {
        this.autoScroll = !this.autoScroll;
    }

    get titles() {
        return this.thread.title + this.thread.parentTitle;
    }

    @Watch("titles")
    onTitlesChange(newValue: number, oldValue: number) {
        this.setTitle();
    }
    setTitle(title: string = ApplicatonName) {
        if (this.server)
            title += " - broadcast mode";
        if (this.thread.title && this.thread.parentTitle)
            title += " " + this.thread.title + "@" + this.thread.parentTitle;
        remote.getCurrentWindow().setTitle(title);
    }

    scrollTo(value: number, duration: number = 1000) {
        if (value < 1) return;
        setTimeout(() => {
            if (this.showListView) return;
            $('.mdl-layout__content').animate({
                scrollTop:
                $('#MESSAGE-' + value).get(0).offsetTop
            }, duration);
        }, 5);
    }

    get formattedTimes() {
        let rtcd = this.reloadTimerCountDown.toString().padStart(2,'0');
        let rd = this.reload.toString().padStart(2,'0');
        return `reload:[${rtcd}/${rd}] next:[${this.provideStatus}]`
    }

    path: string = "";

    findSofTalkPathDialog() {
        remote.dialog.showOpenDialog(remote.getCurrentWindow(), {
            filters: [
                { name: 'exe', extensions: ['exe'] }
            ]
        }, (paths: string[]) => {
            if (paths) {
                this.path = paths[0];
            }
        });
    }

    initScroll() {
        if (this.thread.bookmark != 0)
            this.scrollTo(this.thread.bookmark, 0);
    }

    isValidURL(): boolean {
        if (!this.url) {
            console.log("invalid url", "no input.");
            return false;
        }
        return this.isValidBbsUrl() || this.isValidThreadUrl();
    }

    isValidBbsUrl(): boolean {
        return this.dataSources.some(ds => ds.isValidBbsUrl(this.url));
    }

    isValidThreadUrl(): boolean {
        return this.dataSources.some(ds => ds.isValidThreadUrl(this.url));
    }

    unloadDataSource() {
        if (this.thread)
            this.thread.unload();
        this.thread = null;
    }

    // allocate
    loadUrlSource(load: boolean = true) {
        for (var ds of this.dataSources) {
            if (ds.isValidThreadUrl(this.url)) {
                if (ds.getFormattedUrl) {
                    this.url = ds.getFormattedUrl(this.url);
                }
                this.unloadDataSource();
                this.thread = new ds(this.url);
                if (load) {
                    this.thread.load();
                }
                return;
            }
        }
    }

    get settings() {
        return this.url + this.dummyText + this.autoScroll
            + this.showCommentView
            + this.pManager.vParam.volume
            + this.pManager.vParam.rate
            + this.pManager.vParam.pitch
            + this.pManager.vParam.use
            + this.pManager.vtApiKey
            + this.playingNotificationSound
            + this.reload + this.provideTimeLimit + this.pManager.reading
            + this.path + this.pManager.voice
            + this.comment.NAME + this.comment.MAIL
            + this.sendKey + this.showThumb
            + this.version;
    }

    saveSettings() {
        localStorage.setItem(SETTINGS, JSON.stringify({
            url: this.url,
            autoScroll: this.autoScroll,
            showCommentView: this.showCommentView,
            volume: this.pManager.vParam.volume,
            rate: this.pManager.vParam.rate,
            pitch: this.pManager.vParam.pitch,
            use: this.pManager.vParam.use,
            vtApiKey: this.pManager.vtApiKey,
            reload: this.reload,
            provideTimeLimit: this.provideTimeLimit,
            reading: this.pManager.reading,
            path: this.path,
            voice: this.pManager.voice,
            playingNotificationSound: this.playingNotificationSound,
            dummyText: this.dummyText,
            MAIL: this.comment.MAIL,
            NAME: this.comment.NAME,
            sendKey: this.sendKey,
            showThumb: this.showThumb,
            version: this.version
        }));
    };

    @Watch("settings")
    onSettingsChange(newValue: number, oldValue: number) {
        this.saveSettings();
    }

    version = VERSION;
    electronVersion = require('electron').remote.process.versions.electron;

    getValueOrDefault(value1: any, value2: any) {
        if (typeof value1 === "undefined")
            return value2;
        return value1;
    }

    init() {
        this.pManager = new ProvideManager();
        this.unloadDataSource();
        this.thread = new Shitaraba("dummyThread");
        this.port = port;
        let argv = this.getArgv();
        console.log(argv);
        if (argv.url) this.url = argv.url;

        if (argv.server) {
            this.startServer();
            this.server = true;
        }

        let items = localStorage.getItem(SETTINGS);
        var settings = JSON.parse(items);
        if (!settings) {
            console.log("settings initialize")
            this.pManager.selectVoice();
            this.saveSettings();
            return;
        }

        if (typeof settings.version === "undefined" || this.version != settings.version) {
            this.clearDataSource();
        }
        this.version = this.getValueOrDefault(settings.version, this.version);

        this.showCommentView = this.getValueOrDefault(settings.showCommentView, this.showCommentView);
        this.comment.NAME = this.getValueOrDefault(settings.NAME, this.comment.NAME);
        this.comment.MAIL = this.getValueOrDefault(settings.MAIL, this.comment.MAIL);
        this.playingNotificationSound = Boolean(this.getValueOrDefault(settings.playingNotificationSound, this.playingNotificationSound));
        this.autoScroll = Boolean(this.getValueOrDefault(settings.autoScroll, this.autoScroll));
        this.pManager.vParam.volume = Number(this.getValueOrDefault(settings.volume, this.pManager.vParam.volume));
        this.pManager.vParam.rate = Number(this.getValueOrDefault(settings.rate, this.pManager.vParam.rate));
        this.pManager.vParam.pitch = Number(this.getValueOrDefault(settings.pitch, this.pManager.vParam.pitch));
        this.pManager.vParam.use = Boolean(this.getValueOrDefault(settings.use, this.pManager.vParam.use));
        this.pManager.vtApiKey = this.getValueOrDefault(settings.vtApiKey, this.pManager.vtApiKey);
        this.reload = Number(this.getValueOrDefault(settings.reload, this.reload));
        this.reloadTimerCountDown = this.reload;
        this.provideTimeLimit = Number(this.getValueOrDefault(settings.provideTimeLimit, this.provideTimeLimit));
        this.pManager.reading = Boolean(this.getValueOrDefault(settings.reading, this.pManager.reading));
        this.path = this.getValueOrDefault(settings.path, this.path);
        this.dummyTextTemp = this.dummyText = this.getValueOrDefault(settings.dummyText, this.dummyText);
        this.pManager.voice = Number(this.getValueOrDefault(settings.voice, this.pManager.voice));
        this.pManager.selectVoice(this.path);
        this.showThumb = Boolean(this.getValueOrDefault(settings.showThumb, this.showThumb));

        this.url = this.getValueOrDefault(settings.url, this.url);
        if (argv.url) { this.url = argv.url; }
        if (this.url) {
            if (this.isValidThreadUrl()) {
                this.requestOnce(true);
            }
        }

        this.sendKey = this.getValueOrDefault(settings.sendKey, KEY.SHIFT);

        this.saveSettings();
        console.log("done load settings", items);

        ipcRenderer.on("start", (event, arg) => {
            setTimeout(() => {
                let port = arg;
                this.pManager.connectIOServer(port);
                this.snackbar({ message: "サーバーが起動しました" });
            }, 3000);
        })
        ipcRenderer.on("failed", (event, arg) => {
            this.snackbar({ message: "サーバーの起動に失敗しました。既に起動しているかポートが使用されています。" })
            this.server = false;
        })
        ipcRenderer.on("stop", (event, arg) => {
            setTimeout(() => {
                this.snackbar({ message: "サーバーを停止しました" });
            }, 3000);
        })
    }

    showThumb = true;

    port = 3000;
    server = false;
    flipServerMode() {
        if (process.env.NODE_ENV === "production") return;
        if (this.server) {
            this.stopServer();
        } else {
            this.startServer();
        }
    }

    startServer() {
        console.log("サーバーを起動します[" + this.port + "]");
        ipcRenderer.send("start-server", this.port);
        this.server = true;
    }

    stopServer() {
        console.log("サーバーを停止します");
        this.pManager.disconnectIOClient();
        ipcRenderer.send("stop-server");
        this.server = false;
    }

    mounted() {
        this.setTitle();
        this.initScroll();
    };

    getArgv(): { url: string, server: boolean } {
        let result = { url: "", server: false };
        let argv: string[] = [];
        if (process.env.NODE_ENV != "production") {
            // argv = ["server", ""];
        } else
            argv = ipcRenderer.sendSync('argv');
        console.log("argv : " + argv);
        argv.forEach(element => {
            if (/^https?:\/\/.+/.test(element)) {
                result.url = element;
            } else if (element === "server") {
                result.server = true;
            }
        });
        return result;
    }

    playingNotificationSound: boolean = false;
    notificationSound(callback: () => void) {
        const devPath = "./build/assets/audio/";
        const prodPath = "./resources/app/build/assets/audio/";
        var path = "";
        let audioDirPath = process.env.NODE_ENV === "production" ? fs.existsSync(prodPath) ? prodPath : devPath : devPath;

        fs.readdir(audioDirPath, (err, files) => {
            if (err) {
                console.log(err);
                callback();
                return;
            }
            try {
                var fileList = [];
                files.filter((file) => {
                    console.log(file)
                    return fs.statSync(audioDirPath + file).isFile() && /.*\.mp3$/.test(file); //絞り込み
                }).forEach((file) => {
                    fileList.push(file);
                });
                if (fileList.length > 0) {
                    console.log("audio file : " + fileList[0])
                    path = fileList[Math.floor(Math.random() * fileList.length)];
                }
                if (!path) {
                    callback();
                    return;
                }
            } catch (e) {
                callback();
                return;
            }
            let audio = new Audio("../../assets/audio/" + path);
            audio.onended = callback;
            audio.play();
        });
    }

    clearDataSource() {
        DataSource.clearAllDataSource();
        this.snackbar({ message: "キャッシュを消去しました" });
        this.unloadDataSource();
        this.thread = new Shitaraba("dummyThread");
        this.url = "";
    }

    isMailImg(value: string) {
        return /\.png$/.test(value);
    }

    openLink() {
        window.open(this.thread.url, '_blank');
    }

    CSS = {
        body: CustomCss.body,
        res: CustomCss.res,
        num: CustomCss.num,
        name: CustomCss.name,
        mail: CustomCss.mail,
        date: CustomCss.date,
        id: CustomCss.id,
        header: CustomCss.header,
        message: CustomCss.message
    }
}
