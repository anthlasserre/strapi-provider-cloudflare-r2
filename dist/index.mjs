import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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
const index = {
  init: (config) => {
    const S3 = new S3Client({
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
    const upload = async (file, customParams = {}) => {
      const { Key } = getPathKey(file, config.pool);
      const Body = file.stream || Buffer.from(file.buffer, "binary");
      try {
        await S3.send(
          new PutObjectCommand({
            Bucket: config.params.Bucket,
            ACL: config.params.ACL,
            Key,
            Body,
            ContentType: file.mime,
            ...customParams
          })
        );
      } catch (error) {
        console.log("An error occurred while uploading the file", error);
      }
    };
    const _delete = async (file, customParams = {}) => {
      const { Key } = getPathKey(file, config.pool);
      try {
        await S3.send(
          new DeleteObjectCommand({
            Bucket: config.params.Bucket,
            Key,
            ...customParams
          })
        );
      } catch (error) {
        console.log("An error occurred while deleting the file", error);
      }
    };
    const getSignedUrl$1 = async (file) => {
      const { Key } = getPathKey(file, config.pool);
      try {
        const url = await getSignedUrl(
          S3,
          new GetObjectCommand({ Bucket: config?.params?.Bucket, Key }),
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
      getSignedUrl: getSignedUrl$1,
      isPrivate
    };
  }
};
export {
  index as default
};
//# sourceMappingURL=index.mjs.map
