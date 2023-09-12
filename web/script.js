const baseUrl = 'https://APIGATEWAY_ID.execute-api.us-east-1.amazonaws.com/Prod/'; // TODO: This needs to be replaced
const form = document.getElementsByClassName('form-signin')[0];
var adUsersBucketName = "vcr-ad-usernames-bucket";
var bucketRegion = "us-east-1";
var IdentityPoolId = "us-east-1:956b7757-213d-484c-b1e4-a650251bf7a4";
AWS.config.update({
  region: bucketRegion,
  credentials: new AWS.CognitoIdentityCredentials({
    IdentityPoolId: IdentityPoolId
  })
});

var s3 = new AWS.S3({
  apiVersion: "2006-03-01",
  params: { Bucket: adUsersBucketName }
});

const showAlert = (cssClass, message) => {
  const html = `
    <div class="alert alert-${cssClass} alert-dismissible" role="alert">
        <strong>${message}</strong>
        <button class="close" type="button" data-dismiss="alert" aria-label="Close">
            <span aria-hidden="true">×</span>
        </button>
    </div>`;

  document.querySelector('#alert').innerHTML += html;
};

const formToJSON = (elements) => [].reduce.call(elements, (data, element) => {
  data[element.name] = element.value;
  return data;
}, {});

const getUrlParameter = (name) => {
  name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
  const regex = new RegExp(`[\\?&]${name}=([^&#]*)`);
  const results = regex.exec(location.search);
  return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
};

const handleFormSubmit = (event) => {
  event.preventDefault();

  const postUrl = `${baseUrl}subscriber`;
  const regToken = getUrlParameter('x-amzn-marketplace-token');

  if (!regToken) {
    showAlert('danger',
      'Registration Token Missing. Please go to AWS Marketplace and follow the instructions to set up your account!');
  } else {
    const data = formToJSON(form.elements);
    data.regToken = regToken;


    const xhr = new XMLHttpRequest();

    xhr.open('POST', postUrl, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(JSON.stringify(data));

    xhr.onreadystatechange = () => {
      if (xhr.readyState == XMLHttpRequest.DONE) {
        showAlert('primary', xhr.responseText);
        console.log(JSON.stringify(xhr.responseText));
      }
    };
  }
};


form.addEventListener('submit', handleFormSubmit);

const regToken = getUrlParameter('x-amzn-marketplace-token');
if (!regToken) {
  showAlert('danger', 'Registration Token Missing. Please go to AWS Marketplace and follow the instructions to set up your account!');
}

if (!baseUrl) {
  showAlert('danger', 'Please update the baseUrl');
}

// snippet-start:[s3.JavaScript.photoAlbumExample.addPhoto]
function uploadUsersFiletoS3(event) {
  event.preventDefault();
  var files = document.getElementById("usersupload").files;
  if (!files.length) {
    return alert("Please choose a file to upload first.");
  }
  var userDir = generate_uuidv4();
  var file = files[0];
  var fileName = file.name;
  var albumPhotosKey = encodeURIComponent(userDir) + "/";

  var photoKey = albumPhotosKey + fileName;

  // Use S3 ManagedUpload class as it supports multipart uploads
  var upload = new AWS.S3.ManagedUpload({
    params: {
      Bucket: adUsersBucketName,
      Key: photoKey,
      Body: file
    }
  });

  var promise = upload.promise();

  promise.then(
    function(data) {
        console.log(data)
        document.getElementById("ADUsersS3Prefix").value = data.Key; 
      alert("Successfully uploaded AD users file. Please continue with Registration");
    },
    function(err) {
      return alert("There was an error uploading your photo: ", err.message);
    }
  );
}
// snippet-end:[s3.JavaScript.photoAlbumExample.addPhoto] 

function downloadsampleFromS3() {

  s3.getObject(
    { Bucket: adUsersBucketName, Key: "Sample_UserList.csv" },
    function (error, data) {
      if (error != null) {
        alert("Failed to retrieve an object: " + error);
      } else {
        const fileData = data.Body.toString('utf-8');
        var uri = 'data:text/csv;charset=utf-8,' + fileData;

        var downloadLink = document.createElement("a");
        downloadLink.href = uri;
        downloadLink.download = "sample_users.csv";

        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);

      }
    }
  );
} 

function generate_uuidv4() {
  var dt = new Date().getTime();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,
  function( c ) {
     var rnd = Math.random() * 16;//random number in range 0 to 16
     rnd = (dt + rnd)%16 | 0;
     dt = Math.floor(dt/16);
     return (c === 'x' ? rnd : (rnd & 0x3 | 0x8)).toString(16);
  });
}