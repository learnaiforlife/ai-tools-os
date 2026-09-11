"""AIOS local-only MarkItDown adapter. Never enables plugins or cloud clients."""
import os
import socket
import sys
from pathlib import Path

# Standard document extraction must not resolve remote links from input files.
def offline(*_args, **_kwargs):
    raise RuntimeError("Network access is disabled during local conversion")

socket.create_connection = offline
socket.socket.connect = offline
socket.socket.connect_ex = offline
from markitdown import MarkItDown

source, target = sys.argv[1:3]
extension = Path(source).suffix.lower()
with open(source, "rb") as stream:
    signature = stream.read(1024)
if extension == ".pdf" and b"%PDF-" not in signature:
    raise ValueError("This file is named PDF but has no PDF header. Select a valid PDF document.")
if extension in (".docx", ".pptx", ".xlsx", ".epub") and not signature.startswith(b"PK"):
    raise ValueError("This document is damaged, encrypted, or has the wrong extension.")
result = MarkItDown(enable_plugins=False).convert_local(source)
content = result.text_content
if len(content.encode("utf-8")) > 2 * 1024 * 1024:
    raise RuntimeError("Converted Markdown exceeds the 2 MiB limit; split the source document")
fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, "w", encoding="utf-8") as stream:
    stream.write(content)
