'use client';

import { useState } from "react";

export default function Home() {
  const [urls, setUrls] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [log, setLog] = useState("");
  const [failedUrls, setFailedUrls] = useState<string[]>([]);

  interface DownloadLogItem {
    status: 'success' | 'failure';
    url: string;
    error?: string;
  }

  const handleDownloadZip = async (urlsToDownload?: string[]) => {
    setLoading(true);
    setError("");
    setLog("");
    setFailedUrls([]); // 新しいダウンロードが開始される前にリセット

    const currentUrls = urlsToDownload || urls.split(/\r?\n/).map((u) => u.trim()).filter(Boolean);

    if (!currentUrls.length) {
      setError("URLを1つ以上入力してください。");
      setLoading(false);
      return;
    }

    const body: { urls: string[]; username?: string; password?: string } = { urls: currentUrls };
    if (username && password) {
      body.username = username;
      body.password = password;
    }


    try {
      setLog("ZIPファイルの作成を開始します...\n");

      // APIへのリクエストとログの更新
      const res = await fetch("/api/download-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      // APIからのレスポンスを解析してログを更新
      const result = await res.json();
      const newLog = result.downloadLogs.map((item: DownloadLogItem) => {
        if (item.status === 'success') {
          return `✓ ${item.url}: ダウンロード成功`;
        } else {
          setFailedUrls(prev => [...prev, item.url]);
          return `✗ ${item.url}: ダウンロード失敗 - ${item.error}`;
        }
      }).join('\n');
      
      setLog(prev => prev + newLog + "\n\n");

      if (res.ok) {
        setLog(prev => prev + "すべてのダウンロード処理が完了しました。ZIPファイルのダウンロードを開始します...\n");
        const blobRes = await fetch(result.zipUrl); // ZIPファイルのURLをバックエンドから取得
        const blob = await blobRes.blob();

        const disposition = blobRes.headers.get("content-disposition") || "";
        const match = disposition.match(/filename="(.+)"/);
        const filename = match ? match[1] : "downloaded_files.zip";
        
        const link = document.createElement("a");
        link.href = window.URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(link.href);

        setLog(prev => prev + "ZIPファイルのダウンロードが完了しました。\n");
      } else {
        // res.json() は既に一度呼び出されているため、result を使用する
        setLog(prev => prev + `エラー: ${result.error || "不明なエラー"}\n`);
        setError("ダウンロードに失敗しました。詳細をログで確認してください。");
      }
    } catch (e) {
      console.error(e); // ここでエラー変数eを使用
      setLog(prev => prev + "ネットワークエラーが発生しました。\n");
      setError("ダウンロード中にエラーが発生しました。");
    } finally {
      setLoading(false);
    }
  };

  const handleRetryFailed = () => {
    // ユーザーがテキストエリアに手動で入力した値を保持するため、
    // failedUrlsで上書きする処理を削除します。
    // handleDownloadZipは現在のurls stateを使用するため、
    // ユーザーが変更した値がそのまま再試行されます。
    handleDownloadZip();
  };

  const handleDownloadIgnoringErrors = () => {
    const allUrls = urls.split(/\r?\n/).map((u) => u.trim()).filter(Boolean);
    const urlsToIgnore = new Set(failedUrls);
    const filteredUrls = allUrls.filter(url => !urlsToIgnore.has(url));
    handleDownloadZip(filteredUrls);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white shadow-lg rounded-lg my-8">
      <h1 className="text-3xl font-bold text-gray-800 mb-6 text-center">Next.js Downloader (ZIP)</h1>
      
      <div className="mb-4">
        <label htmlFor="urls" className="block text-gray-700 font-medium mb-2">ダウンロードしたいURLを1行ずつ入力してください:</label>
        <textarea 
          id="urls"
          value={urls}
          onChange={(e) => setUrls(e.target.value)}
          rows={10} 
          className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" 
        />
      </div>

      <div className="mb-4">
        <label htmlFor="username" className="block text-gray-700 font-medium mb-2">ユーザー名:</label>
        <input 
          id="username"
          type="text" 
          value={username} 
          onChange={(e) => setUsername(e.target.value)} 
          className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" 
        />
      </div>

      <div className="mb-6">
        <label htmlFor="password" className="block text-gray-700 font-medium mb-2">パスワード:</label>
        <input 
          id="password"
          type="password" 
          value={password} 
          onChange={(e) => setPassword(e.target.value)} 
          className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" 
        />
      </div>

      <button 
        onClick={() => handleDownloadZip()} 
        disabled={loading} 
        className="w-full bg-blue-600 text-white font-bold py-2 px-4 rounded-md hover:bg-blue-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "ダウンロード中..." : "ZIPとしてダウンロード"}
      </button>

      {failedUrls.length > 0 && (
        <div className="mt-4 space-y-2">
          <button
            onClick={handleRetryFailed}
            className="w-full bg-yellow-500 text-white font-bold py-2 px-4 rounded-md hover:bg-yellow-600 transition-colors duration-200"
          >
            ダウンロードに失敗したURLを再試行
          </button>
          <button
            onClick={handleDownloadIgnoringErrors}
            className="w-full bg-red-500 text-white font-bold py-2 px-4 rounded-md hover:bg-red-600 transition-colors duration-200"
          >
            エラーURLを無視してダウンロード
          </button>
        </div>
      )}

      <pre className="mt-6 p-4 bg-gray-100 text-gray-800 rounded-md shadow-inner overflow-auto font-mono whitespace-pre-wrap">
        {log}
        {failedUrls.length > 0 && (
          <>
            <br />
            <span className="font-bold text-red-600">ダウンロードできなかったURL一覧:</span>
            {"\n" + failedUrls.join('\n')}
          </>
        )}
      </pre>

      {error && (
        <pre className="mt-6 p-4 bg-red-100 text-red-700 rounded-md border border-red-300">
          {error}
        </pre>
      )}
    </div>
  );
}
