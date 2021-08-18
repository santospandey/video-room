var janus_hostname = "192.168.1.109";
// var janus_hostname = "34.83.95.233";
var janus_port = 8088;
var room = null;
var sessionId = null;
var pluginHandleId = null;
var localPeer = null;
var apisecret = "ZjNjY2JiODhiZjU1NDA0NDk3ZGViMGZlYjQwMDY0OGUuOGY5Mjk2ZmY5ODE5NDhlZWE5MzM1NDI2NGRiNTcxZDI=.395556943fa7177d84a7de3e69331104084155a01565eb83df0ca18cf0c7d3378f5a3d6a964705668cfde35d41bfb8bbc8d555d2fe150ab33c983d00fb05f9f7";
const mediaConstraints = {
    offerToReceiveAudio: true,
    offerToReceiveVideo: true,
    iceRestart: true
};

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


document.querySelector("#subscribe").addEventListener("click", function(e){
    room = parseInt(document.querySelector("#roomId").value);
    start(room);
})


/**
 * Main function to start videoroom.
 */
async function start(roomId) {
    // create session.
    var session = await createSession();
    if (session.janus !== "success") {
        console.error("Error in creating session ", session);
        return false;
    }
    console.log("Create session success ...", session);
    sessionId = session.data.id;

    // attach plugin
    var handle = await attachPlugin(session.data.id);
    if (handle.janus !== "success") {
        console.error("Error in attach plugin ", handle);
        return false;
    }
    console.log("Attach videoroom plugin success...", handle);
    pluginHandleId = handle.data.id;

    var register = {
        request: "join",
        room: roomId,
        ptype: "publisher",
        display: "santosh"
    };
    const joinScreenRoomResponse = await joinShareScreenRoom(session.data.id, handle.data.id, register);
    if(joinScreenRoomResponse.janus === "ack"){
        console.log("successfully joined room as publisher for screen sharing.");
    }

    /*

    // start rtc peer connection.
    localPeer = getPeerConnection();
    
    // get audio and video streams.
    const streams = await getMediaDevicesStream(true, true);

    if (!streams || !(streams.getTracks()).length) {
        console.error("Error in receiving streams ");
        return false;
    }
    streams.getTracks().forEach(track => localPeer.addTrack(track, streams));
    const localVideo = document.getElementById("localVideo");
    localVideo.srcObject = streams;
*/

    // Listen for events.
    try{
        getEvents(session.data.id, localPeer);
    }
    catch(err){
        console.error("Error get events ", err);
    }

}

function shareScreen(sessionId, handleId){
    var transaction = uuid.v4();
    var message = {
        request: "create",
        description: "description",
        bitrate: 500000,
        publishers: 1
    };

    var request = {
        "janus": "message",
        "apisecret": apisecret,
        "transaction": transaction,
        "body": message
    };

    var url = "/janus/"+sessionId+"/"+handleId; 

    return postData(url, request);
}

function joinShareScreenRoom(sessionId, handleId, data){
    var transaction = uuid.v4();
    var request = {
        "janus": "message",
        "apisecret": apisecret,
        "transaction": transaction,
        "body": data
    };

    var url = "/janus/"+sessionId+"/"+handleId; 

    return postData(url, request);
}


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

/**
 * 
 * @param {*} offerAudio 
 * @param {*} offerVideo
 * @returns 
 */
function getPeerConnection() {    
    const localPeer = new RTCPeerConnection({
        iceServers: [
            {
                urls: "stun:stun.stunprotocol.org"
            }
        ]
    });

    return localPeer;
}

/**
 * 
 * @param {*} audio 
 * @param {*} video 
 * @returns 
 */
function getMediaDevicesStream(audio, video) {
    const constraints = {
        "audio": audio,
        "video": video
    };
    if (navigator && navigator.mediaDevices) {
        // return navigator.mediaDevices.getUserMedia(constraints);
        return navigator.mediaDevices.getDisplayMedia();
    }
}

/**
 * 
 * @param {*} sessionId 
 * @param {*} handelId 
 */
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

/**
 * 
 * @param {*} sessionId 
 * @param {*} pluginId 
 * @param {*} jsep 
 */
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

/**
 * 
 * @param {*} sessionId 
 * @param {*} localPeer 
 */
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

/**
 * 
 * @param {*} res 
 * @param {*} localPeer 
 */
async function handleEvents(res, localPeer) {
    var janus_result = res.janus;
    if (janus_result == "event") {
        if (res.plugindata && res.plugindata.data) {
            if (res.plugindata.data.videoroom === "joined") {
                console.log("Joined as a publisher ...");
                if(res.plugindata.data.publishers && res.plugindata.data.publishers.length){
                    var list = res.plugindata.data.publishers;
                    for(var f in list){
                        var id = list[f]["id"];
                        var display = list[f]["display"];
                        attachPlugin(res.session_id)
                            .then(handle => {
                                if (handle.janus === "success") {
                                    joinVideoRoom("listener", res.session_id, handle.data.id, id)
                                        .then(response => {
                                            if (response.janus === "ack") {
                                                console.log("Successfully joined videoroom as a subscriber");
                                            }
                                        })
                                }
                            })
                    }
                }
            }
            if (res.plugindata.data.videoroom === "event") {
                
            }
            if ((res.plugindata.data.videoroom === "attached") && res.jsep) {
                const parentElement = document.getElementById("remote-video");
                const remoteVideo = document.createElement("video");
                remoteVideo.setAttribute("autoplay", "true");
                remoteVideo.setAttribute("playsinline", "true");
                remoteVideo.setAttribute("width", "250px");
                remoteVideo.setAttribute("height", "250px");

                const remotePeer = getPeerConnection();

                remotePeer.setRemoteDescription(res.jsep)
                    .then(() => console.log("Answering offer "))

                remotePeer.createAnswer(mediaConstraints)
                    .then(offer => remotePeer.setLocalDescription(offer))
                    .then(() => sendAnswer(res.session_id, res.sender, remotePeer.localDescription.sdp))
                    .catch(err => console.error("Error => ", err))

                remotePeer.ontrack = (event) => {
                    remoteVideo.srcObject = event.streams[0];
                    parentElement.appendChild(remoteVideo);
                }
            }
        }
    }
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
            "room": room
        }
    };

    if (publisherId) {
        request.body["feed"] = parseInt(publisherId);
    }

    var path = '/janus/' + sessionId + '/' + handleId;

    return postData(path, request);
}

/**
 * send answer after receiving offer sdp from janus.
 * @param {*} sessionId 
 * @param {*} handleId 
 * @param {*} sdp 
 */
function sendAnswer(sessionId, handleId, sdp) {
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

    var path = '/janus/' + sessionId + '/' + handleId;
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