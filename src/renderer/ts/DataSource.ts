import Message from "./Message"
export abstract class DataSource {
    messages: Message[] = [];
    url: string = "";
    bookmark: number = 0;
    title: string = "";
    parentTitle: string = "";
    threadLists: ThreadList[] = [];
    constructor(url: string) {
        this.url = url;
    }

    abstract request(success: (number) => void, failed: (err: any) => void);
    //abstract data2json(data: string): number;
    abstract getSetting(success: () => void, failed: (err: any) => void);

    allNum() {
        return this.messages.length;
    }

    next() {
        this.bookmark++;
        this.save();
    }

    latest() {
        this.bookmark = this.allNum();
        this.save();
    }

    load(): boolean {
        var thread = DataSource.loadDataSource(this.url);
        if (thread == null) {
            console.log("new thread.")
            return false;
        }
        console.log("read thread from localstorage.")
        this.decodeFromJson(thread);
        return true;
    }

    decodeFromJson(data: string) {
        var data1 = JSON.parse(data);
        this.bookmark = data1.bookmark;
        this.url = data1.url;
        this.title = data1.title;
        try {
            this.parentTitle = data1.parentTitle;
        } catch (e) {
            this.parentTitle = "";
        }
        var resdata = [];
        for (var i in data1.messages) {
            var decode = Message.decodeFromJson(JSON.stringify(data1.messages[i]));
            resdata.push(decode);
        }
        this.messages = resdata;
    }

    sortMessage() {
        this.messages.sort((n1, n2) => {
            if (n1.num < n2.num) {
                return -1;
            }
            if (n1.num > n2.num) {
                return 1;
            }
            return 0;
        });
    }

    abstract sendMessage(message: any, success: (result: string) => void, failed: (err: any) => void);
    abstract getLists(success: () => void, failed: (err: any) => void);

    save() {
        localStorage.setItem(this.url, this.stringify());
    }
    stringify(): string {
        return JSON.stringify(this);
    }

    abstract unload();

    static loadDataSource(url: string) {
        return localStorage.getItem(url);
    }

    static clearDataSource(url: string) {
        localStorage.removeItem(url);
    }

    static clearAllDataSource() {
        for (var a in localStorage) {
            if (a.startsWith("http"))
                DataSource.clearDataSource(a);
        }
    }
}

export class ThreadList {
    title = "";
    url = "";
    key = "";
}
