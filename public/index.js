// var janus_hostname = "192.168.1.109";
var janus_hostname = "34.83.95.233";
var janus_port = 8088;
var apisecret = "ZjNjY2JiODhiZjU1NDA0NDk3ZGViMGZlYjQwMDY0OGUuNWUyMGE0YmU5MjgzNDRmMDkwZWE1ZGYzMzFjNDExMGI=.7a086d1b1a82ef0e708a1970c1d93fa0eead676bf14ed2d235a76f20ebdb3c213f1ee20bf69926dc9df8a571973fb1afa1193bd19d6d028e11651b09ef53c114";
var session_id = null;
var publishers = [];

/**
 * Create Session in Janus
 */
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

/**
 * @param {*} publisherId 
 * Attach plugin to Janus 
 */
function attachPlugin(publisherId) {
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
                console.log("Attach videoroom plugin success...", res);
                var handleId = res.data.id;
                if (publisherId) {
                    publishers.push({
                        "handleId": handleId,
                        "publisherId": publisherId
                    })
                    joinVideoRoom("subscriber", handleId, publisherId);
                }
                else {
                    joinVideoRoom("publisher", handleId);
                }
            }
        })
}

function sendSDP(sessionId, pluginId, jsep){
    var transaction = uuid.v4();
    var request = {
        "janus": "message",
        "apisecret": apisecret,
        "transaction": transaction,
        "body": {
            "request": "publish",
            "audio": true,
            "video": true
        },
        jsep: jsep
    };
    const path = "/janus/" + sessionId + "/" + pluginId;
    postData(path, request)
    .then(res => {
        console.log("Successful sdp answer ", res);
    })
    .catch(err => {
        console.log("Error while sdp answer ", err);
    })
}

let localPeer;
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
                if (res.plugindata && res.plugindata.data) {
                    if(res.plugindata.data.videoroom === "joined"){
                        console.log("Joined as a publisher now create sdp offer");
                        const mediaConstraints = {                            
                                offerToReceiveAudio: true,
                                offerToReceiveVideo: true,
                                iceRestart: true                         
                        }
                        localPeer = new RTCPeerConnection({
                            iceServers: [
                                {
                                    urls: "stun:stun.stunprotocol.org"
                                }
                            ]
                        });                        

                        localPeer.createOffer(mediaConstraints)
                        .then(offer => localPeer.setLocalDescription(offer))
                        .then(() => {
                            sendSDP(res.session_id, res.sender, localPeer.localDescription);                            
                        })
                        .catch(err => {
                            console.log("Error while creating offer ", err);
                        })

                        if(navigator && navigator.mediaDevices){
                            const constraints = {
                                audio: true,
                                video: true
                            };
                            navigator.mediaDevices.getUserMedia(constraints)
                            .then(stream => {
                                stream.getTracks().forEach(track => {
                                    localPeer.addTrack(track, stream);
                                })
                                const localVideo = document.getElementById("localVideo");
                                localVideo.srcObject = stream;
                            })
                        }
                    }
                    if(res.plugindata.data.videoroom === "event") {
                        if (res.plugindata.data.configured === 'ok') {
                            console.log("Publisher configured ...");
                            if(res.jsep){
                                localPeer.setRemoteDescription(res.jsep)
                                .then(()=>{
                                    console.log("Set Remote.");
                                })
                            }
                        }
                        var length = res.plugindata.data.publishers && res.plugindata.data.publishers.length;
                        if (length) {
                            console.log("Got a new publishers ", res.plugindata.data.publishers);
                            res.plugindata.data.publishers.forEach(p=>attachPlugin(p.id));                            
                        }
                    }
                    if ((res.plugindata.data.videoroom === "attached") && res.jsep) {
                        console.log("got sdp from janus ", res);
                        let remoteVideo = document.createElement("video");
                        remoteVideo.setAttribute("autoplay", "true");
                        remoteVideo.setAttribute("playsinline", "true");
                        remoteVideo.setAttribute("width", "250px");
                        remoteVideo.setAttribute("height", "250px");

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
                            .then(() => {
                                console.log("Answering offer ");
                            })
                        peer.createAnswer(mediaConstraints)
                            .then(offer => {
                                console.log("offer => ", offer);
                                return peer.setLocalDescription(offer);
                            })
                            .then(() => {
                                let publisher = publishers.find((p) => (p.publisherId == res.plugindata.data.id));
                                if(publisher){
                                    sendAnswer(publisher.handleId, peer.localDescription.sdp);
                                }
                            })
                            .catch(err => {
                                console.log("Error => ", err);
                            })

                        peer.ontrack = function (event) {
                            console.log("Remote track: ", event);                            
                            remoteVideo.srcObject = event.streams[0];
                            const parent = document.getElementById("remote-video");
                            parent.appendChild(remoteVideo);
                        }
                    }
                }
            }

            getEvents();
        })
}

// function listPublishers() {
//     var transaction = uuid.v4();
//     var request = {
//         "janus": "message",
//         "apisecret": apisecret,
//         "transaction": transaction,
//         "body": {
//             "request": "listparticipants",
//             "room": 1234
//         }
//     };
//     var path = '/janus/' + session_id + '/' + handle_id;
//     postData(path, request)
//         .then(res => {
//             var janus_result = res.janus;
//             if (janus_result === "success") {
//                 console.log("Successfully listed publishers ", res);
//                 var participants = res.plugindata.data.participants;
//                 publishers = participants.filter(par => par.publisher);
//                 console.log("publishers => ", publishers);
//                 if (publishers.length) {
//                     joinVideoRoom("subscriber", handle_id, publishers[0].id);
//                 }
//             }
//         })
// }

/**
 * 
 * @param {*} type => publisher or subscriber
 * @param {*} handleId => handleId got after attach plugin
 * @param {*} publisherId => publisherId whose content to subscribed to.
 */
function joinVideoRoom(type, handleId, publisherId) {
    var transaction = uuid.v4();
    var request = {
        "janus": "message",
        "apisecret": apisecret,
        "transaction": transaction,
        "body": {
            "request": "join",
            "ptype": type,
            "room": 1234,
            "audio": true,
            "video": true            
        }
    };

    if (publisherId) {
        request.body["feed"] = parseInt(publisherId);
    }

    var path = '/janus/' + session_id + '/' + handleId;

    postData(path, request)
        .then(res => {
            var janus_result = res.janus;
            if (janus_result === "ack") {
                console.log("Join videoroom success ", res);
            }
        })
}

function sendAnswer(handleId, sdp) {
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

    var path = '/janus/' + session_id + '/' + handleId;
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

createSession();