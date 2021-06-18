// var janus_hostname = "192.168.1.109";
var janus_hostname = "34.83.95.233";
var janus_port = 8088;
var apisecret = "ZjNjY2JiODhiZjU1NDA0NDk3ZGViMGZlYjQwMDY0OGUuNWUyMGE0YmU5MjgzNDRmMDkwZWE1ZGYzMzFjNDExMGI=.7a086d1b1a82ef0e708a1970c1d93fa0eead676bf14ed2d235a76f20ebdb3c213f1ee20bf69926dc9df8a571973fb1afa1193bd19d6d028e11651b09ef53c114";
var session_id = null;
var handle_id = null;
var publishers = [];

function sendAnswer(sdp) {
    var transaction = uuid.v4();
    var request = {
        "janus": "message",
        "apisecret": apisecret,
        "body": {
            "request": "start",
            "room": 1234
        },
        "transaction": transaction,
        "jsep": {
            "type": "answer",
            "sdp": sdp
        }
    };

    var path = '/janus/' + session_id + '/' + handle_id;
    postData(path, request)
        .then(res => {
            var janus_result = res.janus;
            if (janus_result === "ack") {
                console.log("offer acked... now wait for answer from events...", res);
            }
            else if (janus_result === "error") {
                console.log("error in sending answer => ", res.error);
            }
        })
}

async function postData(path, data) {
    const url = "http://" + janus_hostname + ":" + janus_port + path;
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
    });
    return response.json();
}

function createSession() {
    var transaction = uuid.v4();
    var request = {
        "janus": "create",
        "apisecret": apisecret,
        "transaction": transaction
    };

    postData("/janus", request)
        .then(res => {
            session_id = res.data.id;
            attachPlugin();
            getEvents();
        })
}

function attachPlugin() {
    var transaction = uuid.v4();
    var request = {
        "janus": "attach",
        "apisecret": apisecret,
        "plugin": "janus.plugin.videoroom",
        "transaction": transaction
    };
    var path = '/janus/' + session_id;
    postData(path, request)
        .then(res => {
            var janus_result = res.janus;
            if (janus_result === "success") {
                handle_id = res.data.id;
                console.log("Attach videoroom plugin success...", res);
                listPublishers();
            }
        })
}

function getEvents() {
    const path = '/janus/' + session_id + '?maxev=1';
    const url = "http://" + janus_hostname + ":" + janus_port + path;
    const response = fetch(url, {
        method: "GET",
        headers: {
            "Content-Type": "application/json"
        }
    })
        .then(data => data.json())
        .then(res => {
            console.log("get event from janus => ", res);
            var janus_result = res.janus;
            if (janus_result == "event") {
                if(res.plugindata && res.plugindata.data && res.plugindata.data.videoroom){
                    if (res.jsep) {
                        var janus_sdp = res.jsep.sdp;
                        console.log("got sdp from janus ", janus_sdp);

                        const mediaConstraints = {
                            mandatory: {
                              OfferToReceiveAudio: true,
                              OfferToReceiveVideo: true,
                            },
                        };

                        const peer = new RTCPeerConnection({
                            iceServers: [
                                {
                                  urls: "stun:stun.stunprotocol.org"
                                }
                              ]
                        });

                        peer.setRemoteDescription(res.jsep)
                        .then(()=>{
                            console.log("Answering offer ");
                        })
                        peer.createAnswer(mediaConstraints)
                        .then(offer => {
                            console.log("offer => ", offer);
                            return peer.setLocalDescription(offer);
                        })
                        .then(()=>{
                            sendAnswer(peer.localDescription.sdp);
                        })
                        .catch(err=>{
                            console.log("Error => ", err);
                        })

                        peer.ontrack = function(event){
                            console.log("Remote track: ", event);
                            const remoteVideo = document.getElementById("remoteVideo");
                            remoteVideo.srcObject = event.streams[0];
                        }

                    }
                }
            }

            getEvents();
        })
}

function listPublishers() {
    var transaction = uuid.v4();
    var request = {
        "janus": "message",
        "apisecret": apisecret,
        "transaction": transaction,
        "body": {
            "request": "listparticipants",
            "room": 1234
        }
    };
    var path = '/janus/' + session_id + '/' + handle_id;
    postData(path, request)
        .then(res => {
            var janus_result = res.janus;
            if (janus_result === "success") {
                console.log("Successfully listed publishers ", res);
                var participants = res.plugindata.data.participants;
                publishers = participants.filter(par => par.publisher);
                console.log("publishers => ", publishers);
                if (publishers.length) {
                    joinVideoRoom(publishers[0].id);
                }
            }
        })
}

function joinVideoRoom(publisherId) {
    var transaction = uuid.v4();
    var request = {
        "janus": "message",
        "apisecret": apisecret,
        "transaction": transaction,
        "body": {
            "request": "join",
            "ptype": "subscriber",
            "room": 1234,
            "offer_video": true,
            "offer_audio": true,
            "audio": true,
            "video": true,
            "feed": parseInt(publisherId)
        }
    };

    var path = '/janus/' + session_id + '/' + handle_id;

    postData(path, request)
        .then(res => {
            var janus_result = res.janus;
            if (janus_result === "ack") {
                console.log("Join videoroom success ", res);
            }
        })
}

createSession();