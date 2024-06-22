"use strict";
const clientS3 = require("@aws-sdk/client-s3");
const s3RequestPresigner = require("@aws-sdk/s3-request-presigner");
const compressPdf = require("compress-pdf");
const compressDocument = async (file) => {
  if (file.ext === ".pdf") {
    return compressPdf.compress(file.stream || Buffer.from(file.buffer, "binary"), {
      gsModule: "/opt/homebrew/bin/g"
    });
  }
  return file.stream || Buffer.from(file.buffer, "binary");
};
const removeLeadingSlash = (str) => {
  return str.replace(/^\//, "");
};
const getPathKey = (file, pool = false) => {
  const filePath = file.path ? `${file.path}/` : "";
  let path = filePath;
  if (!pool) {
    path = file.folderPath && file.folderPath !== "/" ? `${removeLeadingSlash(file.folderPath)}/${filePath}` : filePath;
  }
  const Key = `${path}${file.hash}${file.ext}`;
  return { path, Key };
};
const assertUrlProtocol = (url) => {
  return /^\w*:\/\//.test(url);
};
const index = {
  init: (config) => {
    const S3 = new clientS3.S3Client({
      ...config,
      region: config.region || "auto"
    });
    if (!config.cloudflarePublicAccessUrl) {
      process.emitWarning(
        "\x1B[43mWARNING (strapi-provider-cloudflare-r2):\x1B[0m the provider config requires cloudflarePublicAccessUrl to upload files larger than 5MB. See more: https://github.com/trieb-work/strapi-provider-cloudflare-r2#provider-configuration"
      );
    }
    const aws_keys = Object.keys(process.env).filter(
      (key) => key.startsWith("AWS_")
    );
    if (aws_keys.length > 0) {
      console.warn(
        `\x1B[43mWARNING (strapi-provider-cloudflare-r2):\x1B[0m You are using strapi-provider-cloudflare-r2 and still have AWS_... env vars from provider-upload-aws-s3 set. This could conflict with Cloudflare R2 provider. Please remove ${aws_keys.join(
          ", "
        )} env variable(s) or rename+change them in plugin config. See more: https://github.com/trieb-work/strapi-provider-cloudflare-r2#aws-sdk-configuration-and-aws_-env-variables`
      );
    }
    const getFileURL = async (file) => {
      const { Key } = getPathKey(file);
      if (config.cloudflarePublicAccessUrl) {
        return config.cloudflarePublicAccessUrl.replace(/\/$/g, "") + "/" + Key;
      } else if (config.params.ACL === "private") {
        return s3RequestPresigner.getSignedUrl(
          S3,
          new clientS3.GetObjectCommand({ Bucket: config?.params?.Bucket, Key }),
          { expiresIn: 3600 }
        );
      } else if (config.region !== "auto") {
        return config.params.Location + "/" + Key;
      }
      throw new Error(
        "Cloudflare S3 API returned no file location and cloudflarePublicAccessUrl is not set. strapi-provider-cloudflare-r2 requires cloudflarePublicAccessUrl to upload files larger than 5MB. https://github.com/trieb-work/strapi-provider-cloudflare-r2#provider-configuration"
      );
    };
    const upload = async (file, customParams = {}) => {
      const { Key } = getPathKey(file, config.pool);
      const Body = await compressDocument(file);
      try {
        await S3.send(
          new clientS3.PutObjectCommand({
            Bucket: config.params.Bucket,
            ACL: config.params.ACL,
            Key,
            // @ts-expect-error
            Body,
            ContentType: file.mime,
            ...customParams
          })
        );
        file.url = await getFileURL(file);
        if (!assertUrlProtocol(file.url)) {
          file.url = `https://${file.url}`;
        }
      } catch (error) {
        console.log("An error occurred while uploading the file", error);
      }
    };
    const _delete = async (file, customParams = {}) => {
      const { Key } = getPathKey(file, config.pool);
      try {
        await S3.send(
          new clientS3.DeleteObjectCommand({
            Bucket: config.params.Bucket,
            Key,
            ...customParams
          })
        );
      } catch (error) {
        console.log("An error occurred while deleting the file", error);
      }
    };
    const getSignedUrl = async (file) => {
      const { Key } = getPathKey(file, config.pool);
      try {
        const url = await s3RequestPresigner.getSignedUrl(
          S3,
          new clientS3.GetObjectCommand({ Bucket: config?.params?.Bucket, Key }),
          { expiresIn: 3600 }
        );
        return { url };
      } catch (error) {
        console.log("An error occurred while generating the signed URL", error);
      }
    };
    const isPrivate = async () => {
      return config.params.ACL === "private";
    };
    return {
      uploadStream: upload,
      upload,
      delete: _delete,
      getSignedUrl,
      isPrivate
    };
  }
};
module.exports = index;
//# sourceMappingURL=index.js.map
