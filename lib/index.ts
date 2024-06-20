import {
  S3Client,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  ObjectCannedACL,
} from "@aws-sdk/client-s3";
import { getSignedUrl as getS3SignedUrl } from "@aws-sdk/s3-request-presigner";
import { compress as compressPDF } from "compress-pdf";

type StrapiFile = {
  path: string;
  folderPath: string;
  hash: string;
  ext: string;
  mime: string;
  buffer: WithImplicitCoercion<string>;
  stream: string;
  url: string;
};

type PluginConfig = {
  cloudflarePublicAccessUrl: string;
  region: "auto" | string;
  pool: boolean;
  params: {
    Bucket: string;
    ACL: ObjectCannedACL;
    Location: string;
  };
};

const compressDocument = async (
  file: StrapiFile
): Promise<unknown | Buffer> => {
  if (file.ext === ".pdf") {
    return compressPDF(file.stream || Buffer.from(file.buffer, "binary"), {
      gsModule: "/opt/homebrew/bin/g",
    });
  }
  return file.stream || Buffer.from(file.buffer, "binary");
};

const removeLeadingSlash = (str: string) => {
  return str.replace(/^\//, "");
};

const getPathKey = (file: StrapiFile, pool = false) => {
  const filePath = file.path ? `${file.path}/` : "";
  let path = filePath;
  if (!pool) {
    path =
      file.folderPath && file.folderPath !== "/"
        ? `${removeLeadingSlash(file.folderPath)}/${filePath}`
        : filePath;
  }

  const Key = `${path}${file.hash}${file.ext}`;
  return { path, Key };
};

const assertUrlProtocol = (url: string) => {
  // Regex to test protocol like "http://", "https://"
  return /^\w*:\/\//.test(url);
};

export default {
  init: (config: PluginConfig) => {
    const S3 = new S3Client({
      ...config,
      region: config.region || "auto",
    });

    if (!config.cloudflarePublicAccessUrl) {
      process.emitWarning(
        "\x1b[43mWARNING (strapi-provider-cloudflare-r2):\x1b[0m the provider config requires cloudflarePublicAccessUrl to upload files larger than 5MB. See more: https://github.com/trieb-work/strapi-provider-cloudflare-r2#provider-configuration"
      );
    }

    const aws_keys = Object.keys(process.env).filter((key) =>
      key.startsWith("AWS_")
    );
    if (aws_keys.length > 0) {
      console.warn(
        `\x1b[43mWARNING (strapi-provider-cloudflare-r2):\x1b[0m You are using strapi-provider-cloudflare-r2 and still have AWS_... env vars from provider-upload-aws-s3 set. This could conflict with Cloudflare R2 provider. Please remove ${aws_keys.join(
          ", "
        )} env variable(s) or rename+change them in plugin config. See more: https://github.com/trieb-work/strapi-provider-cloudflare-r2#aws-sdk-configuration-and-aws_-env-variables`
      );
    }

    const getFileURL = async (file: StrapiFile): Promise<string> => {
      const { Key } = getPathKey(file);
      if (config.cloudflarePublicAccessUrl) {
        return config.cloudflarePublicAccessUrl.replace(/\/$/g, "") + "/" + Key;
      } else if (config.params.ACL === "private") {
        return getS3SignedUrl(
          S3,
          new GetObjectCommand({ Bucket: config?.params?.Bucket, Key }),
          { expiresIn: 3600 }
        ) as Promise<string>;
      } else if (config.region !== "auto") {
        return config.params.Location + "/" + Key;
      }
      throw new Error(
        "Cloudflare S3 API returned no file location and cloudflarePublicAccessUrl is not set. strapi-provider-cloudflare-r2 requires cloudflarePublicAccessUrl to upload files larger than 5MB. https://github.com/trieb-work/strapi-provider-cloudflare-r2#provider-configuration"
      );
    };

    const upload = async (file: StrapiFile, customParams = {}) => {
      const { Key } = getPathKey(file, config.pool);
      const Body = await compressDocument(file);
      try {
        await S3.send(
          new PutObjectCommand({
            Bucket: config.params.Bucket,
            ACL: config.params.ACL,
            Key,
            // @ts-expect-error
            Body,
            ContentType: file.mime,
            ...customParams,
          })
        );

        file.url = await getFileURL(file);

        // check if https is included in file URL
        if (!assertUrlProtocol(file.url)) {
          // Default protocol to https protocol
          file.url = `https://${file.url}`;
        }
      } catch (error) {
        console.log("An error occurred while uploading the file", error);
      }
    };

    const _delete = async (file: StrapiFile, customParams = {}) => {
      const { Key } = getPathKey(file, config.pool);
      try {
        await S3.send(
          new DeleteObjectCommand({
            Bucket: config.params.Bucket,
            Key,
            ...customParams,
          })
        );
      } catch (error) {
        console.log("An error occurred while deleting the file", error);
      }
    };

    const getSignedUrl = async (file: StrapiFile) => {
      const { Key } = getPathKey(file, config.pool);
      try {
        const url = await getS3SignedUrl(
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
      getSignedUrl,
      isPrivate,
    };
  },
};
