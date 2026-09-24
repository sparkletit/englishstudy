'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Nav(){
  const path = usePathname() || '/';
  const items = [
    ['/', '📖 查词'],
    ['/import', '📥 导入'],
    ['/listen', '🎧 听写'],
    ['/spell', '✏️ 拼写'],
  ];
  return (
    <nav className="topnav">
      {items.map(([href, label]) => (
        <Link key={href} href={href} className={path === href ? 'on' : ''}>{label}</Link>
      ))}
    </nav>
  );
}
