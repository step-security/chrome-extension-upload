import {debug, getInput, setFailed, setSecret} from '@actions/core'
import fs from 'fs'
import path from 'path'
import {globSync} from 'glob'
import chromeWebstoreUpload from 'chrome-webstore-upload'
import {validateSubscription} from './subscription'

type WebStoreClient = ReturnType<typeof chromeWebstoreUpload>

const SUCCESSFUL_PUBLISH_STATES = new Set([
  'PENDING_REVIEW',
  'PUBLISHED',
  'PUBLISHED_TO_TESTERS'
])

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

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

async function uploadFile(
  webStore: WebStoreClient,
  filePath: string,
  publish: boolean
): Promise<void> {
  let token: string
  let uploadState: string | undefined

  try {
    token = await webStore.fetchToken()
    const zipFile = fs.createReadStream(filePath)
    const uploadResponse = await webStore.uploadExisting(zipFile, token, 60)
    debug(`Chrome Web Store upload state: ${uploadResponse.uploadState}`)
    uploadState = uploadResponse.uploadState
  } catch (error) {
    throw new Error(
      `upload error - ${errorMessage(error)} Publishing was not attempted.`
    )
  }

  if (uploadState !== 'SUCCEEDED') {
    throw new Error(
      `upload error - Chrome Web Store returned upload state "${uploadState ||
        'missing'}". Publishing was not attempted. Check the Chrome Web Store Developer Dashboard for details.`
    )
  }

  if (!publish) {
    return
  }

  try {
    const publishResponse = await webStore.publish('DEFAULT_PUBLISH', token)
    debug(`Chrome Web Store publish state: ${publishResponse.state}`)
    if (!SUCCESSFUL_PUBLISH_STATES.has(publishResponse.state)) {
      throw new Error(
        `Chrome Web Store returned publish state "${publishResponse.state ||
          'missing'}".`
      )
    }
  } catch (error) {
    throw new Error(
      `publish error - Upload succeeded, but publishing failed: ${errorMessage(
        error
      )}. Publish the uploaded package manually from the Chrome Web Store Developer Dashboard.`
    )
  }
}

export async function run(): Promise<void> {
  try {
    await validateSubscription()
    const filePath = getInput('file-path', {required: true})
    const extensionId = getInput('extension-id', {required: true})
    const publisherId = getInput('publisher-id', {required: true})
    const clientId = getInput('client-id', {required: true})
    const clientSecret = getInput('client-secret', {required: true})
    const refreshToken = getInput('refresh-token', {required: true})
    const useGlob = getInput('glob') === 'true'
    const publish = getInput('publish') === 'true'
    if (publish && getInput('publish-target') === 'trustedTesters') {
      throw new Error(
        'publish-target has been removed. Configure the item visibility in the Chrome Web Store Developer Dashboard and remove publish-target from your workflow before publishing.'
      )
    }

    setSecret(clientId)
    setSecret(clientSecret)
    setSecret(refreshToken)

    const webStore = chromeWebstoreUpload({
      extensionId,
      publisherId,
      clientId,
      clientSecret,
      refreshToken
    })

    let uploadPath = filePath
    if (useGlob) {
      const isWindows = process.platform === 'win32'
      const files = globSync(filePath, {
        windowsPathsNoEscape: isWindows
      }).sort((a, b) => {
        if (isWindows) {
          a = a.replace(/\\/g, '/')
          b = b.replace(/\\/g, '/')
        }
        return a.localeCompare(b, 'en')
      })
      if (files.length === 0) {
        throw new Error('No files to match.')
      }
      uploadPath = files[0]
    }

    validateFilePath(uploadPath)
    await uploadFile(webStore, uploadPath, publish)
  } catch (error) {
    setFailed(errorMessage(error))
  }
}

if (require.main === module) {
  void run()
}
