import os
import subprocess
import shutil
import boto3
import botocore
# from zipfile import ZipFile

def lambda_handler(event, context):
    bucket = os.environ['ARTIFACTS_BUCKET']
    urn = event['urn']
    guid = event['guid']

    print('URN', urn)
    print('GUID', guid)

    tmp_folder = '/tmp/{}/{}'.format(urn, guid)
    if not os.path.exists(tmp_folder):
        os.makedirs(tmp_folder)
    input_path = os.path.join(tmp_folder, '{}-{}.glb'.format(urn, guid))
    output_path = os.path.join(tmp_folder, '{}-{}.usdz'.format(urn, guid))

    try:
        s3 = boto3.client('s3')
        s3.download_file(bucket, '{}/{}.glb'.format(urn, guid), input_path)
        subprocess.run(['usd_from_gltf', input_path, output_path], check=True, stdout=subprocess.PIPE)
        s3.upload_file(output_path, bucket, '{}/{}.usdz'.format(urn, guid))
        shutil.rmtree(tmp_folder)
        return {
            'urn': urn,
            'guid': guid,
            'status': 'success',
            'output': '{}/{}.usdz'.format(urn, guid)
        }
    except subprocess.CalledProcessError as err:
        print(err)
        return {
            'urn': urn,
            'guid': guid,
            'status': 'error',
            'message': 'Conversion failed'
        }
    except botocore.exceptions.ClientError as err:
        print(err)
        return {
            'urn': urn,
            'guid': guid,
            'status': 'error',
            'message': 'S3 download or upload failed'
        }
    except Exception as err:
        print(err)
        return {
            'urn': urn,
            'guid': guid,
            'status': 'error',
            'message': 'Unknown error'
        }
