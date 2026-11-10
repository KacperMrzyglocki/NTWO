// Kolejność nie ma znaczenia. Rozszerzenia porównujemy bez uwzględniania wielkości liter.
export const categories = {
  Obrazy: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.heic', '.tiff'],
  Dokumenty: ['.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt', '.xls', '.xlsx', '.csv', '.ppt', '.pptx', '.ods', '.odp', '.md'],
  Archiwa: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz'],
  Muzyka: ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a'],
  Wideo: ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.wmv', '.m4v'],
  Instalatory: ['.exe', '.msi', '.dmg', '.pkg', '.deb', '.rpm', '.appimage'],
};

export const temporaryExtensions = ['.crdownload', '.part', '.partial', '.download', '.tmp', '.temp'];
