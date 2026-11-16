#!/usr/bin/env python3
"""把可发布文件复制到 dist/，排除仓库文件与演示数据。

用法：python scripts/pack.py
产物：dist/  （可直接用于「加载已解压的扩展程序」或提交商店）
"""
import os
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'dist')

FILES = ['manifest.json', 'newtab.html', 'app.js', 'app.css', 'demo.js', 'background.js']
DIRS = ['icons', '_locales']


def main():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)
    total = 0
    for name in FILES:
        src = os.path.join(ROOT, name)
        if not os.path.exists(src):
            raise SystemExit('缺少文件: ' + name)
        shutil.copy2(src, os.path.join(OUT, name))
        total += os.path.getsize(src)
    for name in DIRS:
        src = os.path.join(ROOT, name)
        dst = os.path.join(OUT, name)
        shutil.copytree(src, dst)
        for base, _dirs, files in os.walk(dst):
            for f in files:
                total += os.path.getsize(os.path.join(base, f))
    print('dist/ 已生成，共 %.1f KB' % (total / 1024))


if __name__ == '__main__':
    main()
