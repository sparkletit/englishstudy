import './globals.css';

export const metadata = {
  title: '英语音节划分器 · 音节点读',
  description: '输入单词自动划分音节，音标点读，SIS 标准发音',
  appleWebApp: { capable: true }
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover'
};

export default function RootLayout({ children }){
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
