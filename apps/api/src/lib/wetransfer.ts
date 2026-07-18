import axios from 'axios';

const WETRANSFER_API_URL = 'https://api.wetransfer.com';
const WETRANSFER_API_KEY = process.env.WETRANSFER_API_KEY;

interface WeTransferUploadResponse {
  transfer: {
    id: string;
    download_url: string;
  };
}

export async function createWeTransferTransfer(
  filename: string,
  fileBuffer: Buffer,
  recipientEmail: string,
  message?: string
): Promise<{ success: boolean; downloadUrl?: string; error?: string }> {
  try {
    // Step 1: Create a transfer
    const transferResponse = await axios.post(
      `${WETRANSFER_API_URL}/v2/transfers`,
      {
        files: [
          {
            name: filename,
            size: fileBuffer.length,
          },
        ],
        recipients: [
          {
            email: recipientEmail,
          },
        ],
        message: message || 'Your personalized document',
      },
      {
        headers: {
          Authorization: `Bearer ${WETRANSFER_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const transferId = transferResponse.data.transfer.id;
    const uploadUrl = transferResponse.data.transfer.upload_url;

    // Step 2: Upload the file
    const uploadFormData = new FormData();
    const blob = new Blob([new Uint8Array(fileBuffer)]);
    uploadFormData.append('file', blob, filename);

    await axios.post(uploadUrl, uploadFormData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    // Step 3: Finalize the transfer
    const finalizeResponse = await axios.put(
      `${WETRANSFER_API_URL}/v2/transfers/${transferId}/finalize`,
      {},
      {
        headers: {
          Authorization: `Bearer ${WETRANSFER_API_KEY}`,
        },
      }
    );

    return {
      success: true,
      downloadUrl: finalizeResponse.data.transfer.download_url,
    };
  } catch (error: any) {
    console.error('WeTransfer error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message,
    };
  }
}
