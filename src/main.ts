import * as core from '@actions/core'
import fs from 'fs'
import path from 'path'
import glob from 'glob'
import chromeWebstoreUpload from 'chrome-webstore-upload'
import {validateSubscription} from './subscription'

function validateFilePath(filePath: string): void {
  const workspace = process.env.GITHUB_WORKSPACE
  if (!workspace) return
  const resolved = path.resolve(filePath)
  if (
    !resolved.startsWith(path.resolve(workspace) + path.sep) &&
    resolved !== path.resolve(workspace)
  ) {
    throw new Error(`File path must be within the workspace: ${filePath}`)
  }
}

function uploadFile(
  webStore: any,
  filePath: string,
  publishFlg: string,
  publishTarget: string
): void {
  const myZipFile = fs.createReadStream(filePath)
  webStore
    .uploadExisting(myZipFile)
    .then((uploadRes: any) => {
      core.debug(JSON.stringify(uploadRes))

      if (
        uploadRes.uploadState &&
        (uploadRes.uploadState === 'FAILURE' ||
          uploadRes.uploadState === 'NOT_FOUND')
      ) {
        uploadRes.itemError.forEach((itemError: any) => {
          core.error(
            Error(`${itemError.error_detail} (${itemError.error_code})`)
          )
        })
        core.setFailed(
          'upload error - You will need to go to the Chrome Web Store Developer Dashboard and upload it manually.'
        )
        return
      }

      if (publishFlg === 'true') {
        webStore
          .publish(publishTarget)
          .then((publishRes: any) => {
            core.debug(JSON.stringify(publishRes))
          })
          .catch((e: any) => {
            core.error(e)
            core.setFailed(
              'publish error - You will need to access the Chrome Web Store Developer Dashboard and publish manually.'
            )
          })
      }
    })
    .catch((e: any) => {
      core.error(e)
      core.setFailed(
        'upload error - You will need to go to the Chrome Web Store Developer Dashboard and upload it manually.'
      )
    })
}

async function run(): Promise<void> {
  try {
    await validateSubscription()
    const filePath = core.getInput('file-path', {required: true})
    const extensionId = core.getInput('extension-id', {required: true})
    const clientId = core.getInput('client-id', {required: true})
    const clientSecret = core.getInput('client-secret', {required: true})
    const refreshToken = core.getInput('refresh-token', {required: true})
    const globFlg = core.getInput('glob') as 'true' | 'false'
    const publishFlg = core.getInput('publish') as 'true' | 'false'
    const publishTarget = core.getInput('publish-target')

    core.setSecret(clientId)
    core.setSecret(clientSecret)
    core.setSecret(refreshToken)

    const webStore = chromeWebstoreUpload({
      extensionId,
      clientId,
      clientSecret,
      refreshToken
    })

    if (globFlg === 'true') {
      const files = glob.sync(filePath)
      if (files.length > 0) {
        validateFilePath(files[0])
        uploadFile(webStore, files[0], publishFlg, publishTarget)
      } else {
        core.setFailed('No files to match.')
      }
    } else {
      validateFilePath(filePath)
      uploadFile(webStore, filePath, publishFlg, publishTarget)
    }
  } catch (error) {
    core.setFailed((error as Error).message)
  }
}

run()
