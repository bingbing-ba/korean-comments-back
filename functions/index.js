const functions = require('firebase-functions')
const admin = require('firebase-admin')
const { google } = require('googleapis')
const express = require('express')
const cors = require('cors')

const app = express()
admin.initializeApp()
const youtube = google.youtube({
  version: 'v3',
  auth: functions.config().youtube.auth,
})
const isKorean = /[가-힣]/
const isKoreanChar = /[ㄱ-ㅎ]/

app.use(cors({ origin: true }))

app.get('/comments', async (req, res) => {
  const videoId = req.query.v
  if (!videoId) {
    res.json({ error: 'v is required' })
    return
  }
  try {
    const comments = await admin
      .database()
      .ref('comments/' + videoId)
      .once('value')
    res.json(comments.val())
    return
  } catch (error) {
    res.json({ error: 'error occured when read data' })
    return
  }
})

app.post('/comments', async (req, res) => {
  const videoId = req.body.v
  if (!videoId) {
    res.json({ error: 'v is required' })
    return
  }
  const result = { items: [], updated_at: null }
  let nextPageToken = null

  for (let index = 0; index < 20; index++) {
    if (result.items.length > 100) {
      // when find more than 100 korean comments
      break
    }
    if (index === 10 && result.items.length === 0) {
      // when search 1000 comments but cannot find any korean comment
      break
    }
    try {
      const comments = await youtube.commentThreads.list({
        part: ['snippet,replies'],
        videoId,
        maxResults: 100,
        order: 'relevance',
        pageToken: nextPageToken,
      })

      for (const item of comments.data.items) {
        const comment = item.snippet.topLevelComment.snippet.textDisplay
        if (isKorean.test(comment) || isKoreanChar.test(comment)) {
          result.items.push(item)
        }
      }
      if (!comments.data.nextPageToken) {
        // when already search all comments
        break
      } else {
        nextPageToken = comments.data.nextPageToken
      }
    } catch (error) {
      res.json({ error })
      return
    }
  }
  result.updated_at = Date.now()

  // update to db
  try {
    await admin
      .database()
      .ref('comments/' + videoId)
      .set(result)
  } catch (error) {
    res.json({ error: 'error occured when saving data' })
    return
  }
  res.json({ status: 200 })
})

app.get('/opinions', async (req, res) => {
  try {
    const opinions = await admin.database().ref('opinions/').once('value')
    res.json(opinions.val())
    return
  } catch (error) {
    res.json({ error: 'error occured when read data' })
    return
  }
})

app.post('/opinions', async (req, res) => {
  const { username, content } = req.body
  if (!username || !content) {
    res.json({ error: 'username and content is required' })
    return
  }
  try {
    const opinionData = {
      username,
      content,
    }
    const newOpinionKey = admin.database().ref().child('opinions').push().key
    const updates = {}
    updates[`opinions/${newOpinionKey}`] = opinionData
    await admin.database().ref().update(updates)
  } catch (error) {
    res.json({ error: 'error occured when saving data' })
    return
  }
  res.json({ status: 200 })
})

const runtimeOpt = {
  timeoutSeconds: 180,
}

exports.koreanYoutube = functions.runWith(runtimeOpt).https.onRequest(app)