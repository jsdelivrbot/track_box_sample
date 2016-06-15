/// <reference path="../typings/browser.d.ts"/>
// When we distribute Argon typings, we can get rid of this, but for now
// we need to shut up the Typescript compiler about missing Argon typings
declare const Argon:any;

// any time we use an INERTIAL frame in Cesium, it needs to know where to find it's
// ASSET folder on the web.  The SunMoonLights computation uses INERTIAL frames, so
// so we need to put the assets on the web and point Cesium at them
var CESIUM_BASE_URL='../../cesium/';

// grab some handles on APIs we use
const Cesium = Argon.Cesium;
const Cartesian3 = Argon.Cesium.Cartesian3;
const ReferenceFrame = Argon.Cesium.ReferenceFrame;
const JulianDate = Argon.Cesium.JulianDate;
const CesiumMath = Argon.Cesium.CesiumMath;

// set up Argon
const app = Argon.init();

// set up THREE.  Create a scene, a perspective camera and an object
// for the user's location
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera();
const userLocation = new THREE.Object3D;
scene.add(camera);
scene.add(userLocation);

// The CSS3DArgonRenderer supports mono and stereo views, and 
// includes both 3D elements and a place to put things that appear 
// fixed to the screen (heads-up-display).  In this demo, we are 
// rendering the 3D graphics with WebGL, using the standard
// WebGLRenderer, but using the CSS3DArgonRenderer
// to manage the 2D display fixed content
const cssRenderer = new (<any>THREE).CSS3DArgonRenderer();
const renderer = new THREE.WebGLRenderer({ 
    alpha: true, 
    logarithmicDepthBuffer: true
});
renderer.setPixelRatio(window.devicePixelRatio);

// the order we add the two renderers controls which content is in front
app.view.element.appendChild(renderer.domElement);
app.view.element.appendChild(cssRenderer.domElement);

// We put some elements in the index.html, for convenience. 
// Here, we retrieve them, duplicate and move the information boxes to the 
// the CSS3DArgonRnderer hudElements.  We are explicitly creating the two
// elements so we can update them both.
let menu = document.getElementById('menu');
let menu2: HTMLElement = menu.cloneNode( true ) as HTMLElement;
menu2.id = "menu2";   // make the id of the new clone unique

var menuchild = menu.getElementsByClassName('location');
let elem = menuchild.item(0) as HTMLElement;
menuchild = menu2.getElementsByClassName('location');
let elem2 = menuchild.item(0) as HTMLElement;

menu.remove();
menu2.remove();
cssRenderer.hudElements[0].appendChild(menu);
cssRenderer.hudElements[1].appendChild(menu2);

// Tell argon what local coordinate system you want.  The default coordinate
// frame used by Argon is Cesium's FIXED frame, which is centered at the center
// of the earth and oriented with the earth's axes.  
// The FIXED frame is inconvenient for a number of reasons: the numbers used are
// large and cause issues with rendering, and the orientation of the user's "local
// view of the world" is different that the FIXED orientation (my perception of "up"
// does not correspond to one of the FIXED axes).  
// Therefore, Argon uses a local coordinate frame that sits on a plane tangent to 
// the earth near the user's current location.  This frame automatically changes if the
// user moves more than a few kilometers.
// The EUS frame cooresponds to the typical 3D computer graphics coordinate frame, so we use
// that here.  The other option Argon supports is localOriginEastNorthUp, which is
// more similar to what is used in the geospatial industry
app.context.setDefaultReferenceFrame(app.context.localOriginEastUpSouth);

// All geospatial objects need to have an Object3D linked to a Cesium Entity.
// We need to do this because Argon needs a mapping between Entities and Object3Ds.
//
// Here we create two objects, showing two slightly different approaches.
//
// First, we position a cube near Georgia Tech using a known LLA.
//
// Second, we will position a cube near our starting location.  This geolocated object starts without a
// location, until our reality is set and we know the location.  Each time the reality changes, we update
// the cube position.

// create a 100m cube with a Buzz texture on it, that we will attach to a geospatial object at Georgia Tech
var buzz = new THREE.Object3D;
var loader = new THREE.TextureLoader();
loader.load( 'buzz.png', function ( texture ) {
    var geometry = new THREE.BoxGeometry(10, 10, 10)
    var material = new THREE.MeshBasicMaterial( { map: texture } )

    var mesh = new THREE.Mesh( geometry, material )
    mesh.scale.set(100,100,100)
    buzz.add( mesh )
});

// have our geolocated object start somewhere, in this case 
// near Georgia Tech in Atlanta.
// you should probably adjust this to a spot closer to you 
// (we found the lon/lat of Georgia Tech using Google Maps)
var gatechGeoEntity = new Cesium.Entity({
    name: "Georgia Tech",
    position: Cartesian3.fromDegrees(-84.398881, 33.778463),
    orientation: Cesium.Quaternion.IDENTITY
});

var gatechGeoTarget = new THREE.Object3D;
gatechGeoTarget.add(buzz)
scene.add(gatechGeoTarget);

// create a 1m cube with a wooden box texture on it, that we will attach to the geospatial object when we create it
// Box texture from https://www.flickr.com/photos/photoshoproadmap/8640003215/sizes/l/in/photostream/
//, licensed under https://creativecommons.org/licenses/by/2.0/legalcode
var boxGeoObject = new THREE.Object3D;

var box = new THREE.Object3D
var loader = new THREE.TextureLoader()
loader.load( 'box.png', function ( texture ) {
    var geometry = new THREE.BoxGeometry(1, 1, 1)
    var material = new THREE.MeshBasicMaterial( { map: texture } )
    var mesh = new THREE.Mesh( geometry, material )
    box.add( mesh )
})

var boxGeoEntity = new Argon.Cesium.Entity({
    name: "I have a box",
    position: Cartesian3.ZERO,
    orientation: Cesium.Quaternion.IDENTITY
});

boxGeoObject.add(box);

// putting position and orientation in the constructor above is the 
// equivalent of doing this:
//
//     const boxPosition = new Cesium.ConstantPositionProperty
//                   (Cartesian3.ZERO.clone(), ReferenceFrame.FIXED);
//     boxGeoEntity.position = boxPosition;
//     const boxOrientation = new Cesium.ConstantProperty(Cesium.Quaternion);
//     boxOrientation.setValue(Cesium.Quaternion.IDENTITY);
//     boxGeoEntity.orientation = boxOrientation;

var boxInit = false;
var boxCartographicDeg = [0,0,0];
var lastInfoText = "";
var lastTime = null;

// make floating point output a little less ugly
function toFixed(value, precision) {
    var power = Math.pow(10, precision || 0);
    return String(Math.round(value * power) / power);
}

// the updateEvent is called each time the 3D world should be
// rendered, before the renderEvent.  The state of your application
// should be updated here.
app.updateEvent.addEventListener(() => {
    // get the position and orientation (the "pose") of the user
    // in the local coordinate frame.
    const userPose = app.context.getEntityPose(app.context.user);
    // assuming we know the user's pose, set the position of our 
    // THREE user object to match it
    if (userPose.poseStatus & Argon.PoseStatus.KNOWN) {
        userLocation.position.copy(userPose.position);
    } else {
        // if we don't know the user pose we can't do anything
        return;
    }

    // the first time through, we create a geospatial position for
    // the box somewhere near us 
    if (!boxInit) {
        const frame = app.context.getDefaultReferenceFrame();

        // set the box's position to 10 meters away from the user.
        // First, clone the userPose postion, and add 10 to the X
        const boxPos = userPose.position.clone();
        boxPos.x += 10;
        // set the value of the box Entity to this local position, by
        // specifying the frame of reference to our local frame
        boxGeoEntity.position.setValue(boxPos, frame);        

        // orient the box according to the local world frame
        boxGeoEntity.orientation.setValue(Cesium.Quaternion.IDENTITY);

        // now, we want to move the box's coordinates to the FIXED frame, so
        // the box doesn't move if the local coordinate system origin changes.
        // Get box position in global coordinates and reset it's
        // position to be independent of the user location, in the 
        // global frame of reference
        const boxPoseFIXED = app.context.getEntityPose(boxGeoEntity, ReferenceFrame.FIXED);

        if (boxPoseFIXED.poseStatus & Argon.PoseStatus.KNOWN) {
            boxInit = true;
            boxGeoEntity.position.setValue(boxPoseFIXED.position, ReferenceFrame.FIXED);
            boxGeoEntity.orientation.setValue(boxPoseFIXED.orientation);

            // once everything is done, add it to the scene
            scene.add(boxGeoObject);
        }
    }

    // get the local coordinates of the local box, and set the THREE object
    var boxPose = app.context.getEntityPose(boxGeoEntity);
    boxGeoObject.position.copy(boxPose.position);        
    boxGeoObject.quaternion.copy(boxPose.orientation);

    // get the local coordinates of the GT box, and set the THREE object
    var geoPose = app.context.getEntityPose(gatechGeoEntity);
    gatechGeoTarget.position.copy(geoPose.position);        

    // rotate the boxes at a constant speed, independent of frame rates
    var deltaTime = 0;
    if (lastTime) {
        deltaTime = JulianDate.secondsDifference(app.context.getTime(), lastTime);
    } else {
        lastTime = new JulianDate();
    }
    lastTime = app.context.getTime().clone(lastTime);
     
    // make it a little less boring
    buzz.rotateY(2 * deltaTime);
    box.rotateY( 3 * deltaTime);

    //
    // stuff to print out the status message.  It's fairly expensive to convert FIXED
    // coordinates back to LLA, but those coordinates probably make the most sense as
    // something to show the user, so we'll do that computation.
    //

    // cartographicDegrees is a 3 element array containing [longitude, latitude, height]
    var gpsCartographicDeg = [0,0,0];

    // get user position in global coordinates
    const userPoseFIXED = app.context.getEntityPose(app.context.user, ReferenceFrame.FIXED);
    const userLLA = Cesium.Ellipsoid.WGS84.cartesianToCartographic(userPoseFIXED.position);
    if (userLLA) {
        gpsCartographicDeg = [
            CesiumMath.toDegrees(userLLA.longitude),
            CesiumMath.toDegrees(userLLA.latitude),
            userLLA.height
        ];
    }

    const boxPoseFIXED = app.context.getEntityPose(boxGeoEntity, ReferenceFrame.FIXED);
    const boxLLA = Cesium.Ellipsoid.WGS84.cartesianToCartographic(boxPoseFIXED.position);
    if (boxLLA) {
        boxCartographicDeg = [
            CesiumMath.toDegrees(boxLLA.longitude),
            CesiumMath.toDegrees(boxLLA.latitude),
            boxLLA.height
        ];
    }

    // we'll compute the distance to the cube, just for fun. If the cube could be further away,
    // we'd want to use Cesium.EllipsoidGeodesic, rather than Euclidean distance, but this is fine here.
	var cameraPos = camera.getWorldPosition();
    var buzzPos = buzz.getWorldPosition();
    var boxPos = box.getWorldPosition();
    var distanceToBox = cameraPos.distanceTo( boxPos );
    var distanceToBuzz = cameraPos.distanceTo( buzzPos );

    // create some feedback text
    var infoText = "Geospatial Argon example:\n"
    // infoText = "frame: " + state.frameNumber;
    // infoText += " argon time (" + toFixed(three.argon.time.secondsOfDay, 1) + ")";
    // infoText += " three time (" + toFixed(three.Time.now, 1) + ")\n";
    infoText += "eye (" + toFixed(gpsCartographicDeg[0],6) + ", ";
    infoText += toFixed(gpsCartographicDeg[1], 6) + ", " + toFixed(gpsCartographicDeg[2], 2) + ")\n";
    infoText += "cube(" + toFixed(boxCartographicDeg[0], 6) + ", ";
    infoText += toFixed(boxCartographicDeg[1], 6) + ", " + toFixed(boxCartographicDeg[2], 2) + ")\n";
    infoText += "distance to box (" + toFixed(distanceToBox,2) + ")";
    infoText += " distance to GT (" + toFixed(distanceToBuzz,2) + ")";

    if (lastInfoText !== infoText) { // prevent unecessary DOM invalidations
        elem.innerText = infoText;
        elem2.innerText = infoText;
        lastInfoText = infoText;
    }
})
    
// renderEvent is fired whenever argon wants the app to update its display
app.renderEvent.addEventListener(() => {
    // set the renderers to know the current size of the viewport.
    // This is the full size of the viewport, which would include
    // both views if we are in stereo viewing mode
    const viewport = app.view.getViewport();
    renderer.setSize(viewport.width, viewport.height);
    cssRenderer.setSize(viewport.width, viewport.height);

    // there is 1 subview in monocular mode, 2 in stereo mode    
    var i = 0;
    for (let subview of app.view.getSubviews()) {
        // set the position and orientation of the camera for 
        // this subview
        camera.position.copy(subview.pose.position);
        camera.quaternion.copy(subview.pose.orientation);
        // the underlying system provide a full projection matrix
        // for the camera. 
        camera.projectionMatrix.fromArray(subview.projectionMatrix);

        // set the viewport for this view
        let {x,y,width,height} = subview.viewport;

        // set the CSS rendering up, by computing the FOV, and render this view
        cssRenderer.updateCameraFOVFromProjection(camera);
        cssRenderer.setViewport(x,y,width,height, i);
        cssRenderer.render(scene, camera, i);

        // set the webGL rendering parameters and render this view
        renderer.setViewport(x,y,width,height);
        renderer.setScissor(x,y,width,height);
        renderer.setScissorTest(true);
        renderer.render(scene, camera);
    }
})

