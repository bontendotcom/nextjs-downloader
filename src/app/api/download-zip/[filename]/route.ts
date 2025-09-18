import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

const TMP_DIR = path.join(os.tmpdir(), 'nextjs-downloader');

export async function GET(req: Request, { params }: { params: { filename: string } }) {
  const { filename } = params;
  
  // ファイル名に不正な文字がないか検証
  if (!filename || filename.includes('..') || path.isAbsolute(filename)) {
    return NextResponse.json({ error: '不正なファイル名です。' }, { status: 400 });
  }

  const filePath = path.join(TMP_DIR, filename);

  // ファイルが存在するか確認
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'ファイルが見つかりません。' }, { status: 404 });
  }

  try {
    // ファイルをストリームで読み込んでレスポンスとして返す
    const fileStream = fs.createReadStream(filePath);
    
    // ストリームをBlobに変換
    const streamToBlob = (stream: fs.ReadStream) => {
      return new Promise<Blob>((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on('end', () => resolve(new Blob(chunks)));
        stream.on('error', (err) => reject(err));
      });
    };
    
    const blob = await streamToBlob(fileStream);

    // ダウンロード後にファイルを削除 (本番環境では注意)
    fs.unlink(filePath, (err) => {
      if (err) console.error('一時ファイルの削除に失敗しました:', err);
    });

    return new NextResponse(blob, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

  } catch (error) {
    console.error('サーバーエラー:', error);
    return NextResponse.json({ error: 'サーバーで内部エラーが発生しました。' }, { status: 500 });
  }
}