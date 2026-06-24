import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const audioFile = formData.get('audio') as File | null
    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 })
    }

    const arrayBuffer = await audioFile.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const base64Audio = buffer.toString('base64')

    let zai
    try {
      zai = await ZAI.create()
    } catch (e) {
      console.error('ZAI create failed', e)
      return NextResponse.json({ error: 'ASR service unavailable' }, { status: 500 })
    }

    const response = await zai.audio.asr.create({
      file_base64: base64Audio,
    })

    const text = (response as any)?.text || ''
    return NextResponse.json({ text, success: true })
  } catch (e: any) {
    console.error('ASR API error', e)
    return NextResponse.json(
      { error: e?.message || 'Internal error', success: false },
      { status: 500 },
    )
  }
}
