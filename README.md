# forge-extra-derivatives-aws

Experimental AWS serverless architecture for post-processing 3D models from [Autodesk Forge](https://forge.autodesk.com)
to additional formats such as [glTF, glb](https://www.khronos.org/gltf), or [Usdz](https://graphics.pixar.com/usd/release/wp_usdz.html).

## Architecture

![Architecture diagram](./docs/architecture.png)

Here's a quick description of the different resources used in the AWS SAM template:

- _JobsTable_ - DynamoDB table storing the status of conversion jobs and their artifacts
- _ArtifactsBucket_ - S3 bucket storing the conversion artifacts
- _RestApi_ - REST API definition with CORS settings
- _GetJobFunction_ - Lambda function (Node.js) handling `GET` requests
- _PostJobFunction_ - Lambda function (Node.js) handling `POST` requests
- _GenerateArtifactUrlsFunction_ - Lambda function (Node.js) handling `POST` requests that generate temporary signed URLs for artifacts
- _ConversionStateMachine_ - Step Function orchestrating individual steps of the conversion
- _DownloadSvfFunction_ - Lambda function (Node.js) handling the downloading of SVF assets from Forge
- _ConvertSvfToGltfFunction_ - Lambda function (Node.js) converting SVF assets to glTF
- _ConvertGltfToGlbFunction_ - Lambda function (Node.js) converting glTF to glb
- _ConvertGltfToDracoFunction_ - Lambda function (Node.js) converting glTF to glb with Draco compression
- _ConvertGltfToUsdzFunction_ - Lambda function (Python) using a custom Docker image to convert glb to usdz
- _SharedLayer_ - Lambda layer with shared code and dependencies for all Node.js-based Lambda functions

The _ConversionStateMachine_ consists of the following states:

![Conversion state machine](./docs/conversion-state-machine.png)
