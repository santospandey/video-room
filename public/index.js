// var janus_hostname = "192.168.1.109";
var janus_hostname = "34.83.95.233";
var janus_port = 8088;
var apisecret = "ZjNjY2JiODhiZjU1NDA0NDk3ZGViMGZlYjQwMDY0OGUuNWUyMGE0YmU5MjgzNDRmMDkwZWE1ZGYzMzFjNDExMGI=.7a086d1b1a82ef0e708a1970c1d93fa0eead676bf14ed2d235a76f20ebdb3c213f1ee20bf69926dc9df8a571973fb1afa1193bd19d6d028e11651b09ef53c114";
var session_id = null;
var publishers = [];

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

/**
 * Main function to start videoroom.
 */
async function start() {
    var session = await createSession();
    if (session.janus !== "success") {
        console.error("Error in creating session ", session);
        return false;
    }
    console.log("Create session success ...", session);

    var handle = await attachPlugin(session.data.id);
    if (handle.janus !== "success") {
        console.error("Error in attach plugin ", handle);
        return false;
    }
    console.log("Attach videoroom plugin success...", handle);

    const localPeer = startLocalPeer(true, true, session.data.id, handle.data.id);
    const streams = await getMediaDevicesStream(true, true);

    if (!streams || !(streams.getTracks()).length) {
        console.error("Error in receiving streams ");
        return false;
    }
    streams.getTracks().forEach(track => localPeer.addTrack(track, streams));
    const localVideo = document.getElementById("localVideo");
    localVideo.srcObject = streams;

    const joinRoom = await joinVideoRoom("publisher", session.data.id, handle.data.id);
    if (joinRoom.janus !== "ack") {
        console.error("Error in joining videoroom as publisher ", joinRoom);
        return false;
    }
    console.log("Join video room as publisher success...", joinRoom);
    getEvents(session.data.id, localPeer);
}

start();

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

    return postData("/janus", request);
}

var localPeer;

/**
 * @param {*} publisherId 
 * Attach plugin to Janus 
 */
function attachPlugin(sessionId) {
    var transaction = uuid.v4();
    var request = {
        "janus": "attach",
        "apisecret": apisecret,
        "plugin": "janus.plugin.videoroom",
        "transaction": transaction
    };
    var path = '/janus/' + sessionId;
    return postData(path, request);
}


function startLocalPeer(offerAudio, offerVideo, sessionId, handleId) {
    const mediaConstraints = {
        offerToReceiveAudio: offerAudio,
        offerToReceiveVideo: offerVideo,
        iceRestart: true
    }
    const localPeer = new RTCPeerConnection({
        iceServers: [
            {
                urls: "stun:stun.stunprotocol.org"
            }
        ]
    });

    localPeer.onnegotiationneeded = async () => {
        localPeer.createOffer(mediaConstraints)
            .then(offer => localPeer.setLocalDescription(offer))
            .then(() => {
                sendSDP(sessionId, handleId, localPeer.localDescription);
            })
            .catch(err => {
                console.log("Error while creating offer ", err);
            })
    }

    return localPeer;
}

function getMediaDevicesStream(audio, video) {
    const constraints = {
        "audio": audio,
        "video": video
    };
    if (navigator && navigator.mediaDevices) {
        return navigator.mediaDevices.getUserMedia(constraints);
    }
}

function sendTrickleRequestLocal(sessionId, handelId) {
    var transaction = uuid.v4();
    var request = {
        "janus": "trickle",
        "apisecret": apisecret,
        "transaction": transaction,
        "candidates": localPeer.toSendCandidatesLocal
    };
    const path = "/janus/" + sessionId + "/" + handelId;
    postData(path, request)
        .then(res => {
            console.log("successful trickle");
        })
        .catch(err => {
            console.log("Error trickle ", err);
        })
}

function sendSDP(sessionId, pluginId, jsep) {
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

function getEvents(sessionId, localPeer) {
    const path = '/janus/' + sessionId + '?maxev=1';
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
            handleEvents(res, localPeer);
            getEvents(sessionId, localPeer);
        })
}

function handleEvents(res, localPeer) {
    var janus_result = res.janus;
    if (janus_result == "event") {
        if (res.plugindata && res.plugindata.data) {
            if (res.plugindata.data.videoroom === "joined") {
                console.log("Joined as a publisher ...");
            }
            if (res.plugindata.data.videoroom === "event") {
                if (res.plugindata.data.configured === 'ok') {
                    console.log("Publisher configured ...");
                    if (res.jsep) {
                        localPeer.setRemoteDescription(res.jsep)
                            .then(() => {
                                console.log("Set Remote.");
                            })
                    }
                }
                var length = res.plugindata.data.publishers && res.plugindata.data.publishers.length;
                if (length) {
                    console.log("Got a new publishers ", res.plugindata.data.publishers);
                    res.plugindata.data.publishers.forEach(p => attachPlugin(p.id));
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

                const remotePeer = new RTCPeerConnection({
                    iceServers: [
                        {
                            urls: "stun:stun.stunprotocol.org"
                        }
                    ]
                });

                remotePeer.setRemoteDescription(res.jsep)
                    .then(() => {
                        console.log("Answering offer ");
                    })
                remotePeer.createAnswer(mediaConstraints)
                    .then(offer => {
                        console.log("offer => ", offer);
                        return remotePeer.setLocalDescription(offer);
                    })
                    .then(() => {
                        debugger;
                        // let publisher = publishers.find((p) => (p.publisherId == res.plugindata.data.id));
                        // if (publisher) {
                        //     sendAnswer(publisher.handleId, remotePeer.localDescription.sdp);
                        // }
                        let publishers = listPublishers();
                    })
                    .catch(err => {
                        console.log("Error => ", err);
                    })

                remotePeer.ontrack = function (event) {
                    console.log("Remote track: ", event);
                    remoteVideo.srcObject = event.streams[0];
                    const parent = document.getElementById("remote-video");
                    parent.appendChild(remoteVideo);
                }
            }
        }
    }
}


async function listPublishers(sessionId, handleId) {
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
    var path = '/janus/' + sessionId + '/' + handleId;
    var response = await postData(path, request);
    debugger;
    // .then(res => {
    //     var janus_result = res.janus;
    //     if (janus_result === "success") {
    //         console.log("Successfully listed publishers ", res);
    //         var participants = res.plugindata.data.participants;
    //         publishers = participants.filter(par => par.publisher);
    //         console.log("publishers => ", publishers);
    //         if (publishers.length) {
    //             joinVideoRoom("subscriber", handle_id, publishers[0].id);
    //         }
    //     }
    // })
}

/**
 * 
 * @param {*} type => publisher or subscriber
 * @param {*} handleId => handleId got after attach plugin
 * @param {*} publisherId => publisherId whose content to subscribed to.
 */
function joinVideoRoom(type, sessionId, handleId, publisherId) {
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
            "video": false
        }
    };

    if (publisherId) {
        request.body["feed"] = parseInt(publisherId);
    }

    var path = '/janus/' + sessionId + '/' + handleId;

    return postData(path, request);
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