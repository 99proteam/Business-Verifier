import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "@/lib/firebase/client";

function safeName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

export async function uploadEvidenceFiles(pathPrefix: string, files: File[]) {
  const currentStorage = storage;
  if (!currentStorage) {
    throw new Error("Firebase storage is not configured.");
  }

  const uploads = files.map(async (file, index) => {
    const objectPath = `${pathPrefix}/${Date.now()}-${index}-${safeName(file.name)}`;
    const objectRef = ref(currentStorage, objectPath);
    await uploadBytes(objectRef, file);
    return getDownloadURL(objectRef);
  });

  return Promise.all(uploads);
}
