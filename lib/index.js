"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const compress_pdf_1 = require("compress-pdf");
const compressDocument = async (file) => {
    if (file.ext === ".pdf") {
        return (0, compress_pdf_1.compress)(file.stream || Buffer.from(file.buffer, "binary"), {
            gsModule: "/opt/homebrew/bin/g",
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
        path =
            file.folderPath && file.folderPath !== "/"
                ? `${removeLeadingSlash(file.folderPath)}/${filePath}`
                : filePath;
    }
    const Key = `${path}${file.hash}${file.ext}`;
    return { path, Key };
};
const assertUrlProtocol = (url) => {
    // Regex to test protocol like "http://", "https://"
    return /^\w*:\/\//.test(url);
};
exports.default = {
    init: (config) => {
        const S3 = new client_s3_1.S3Client({
            ...config,
            region: config.region || "auto",
        });
        if (!config.cloudflarePublicAccessUrl) {
            process.emitWarning("\x1b[43mWARNING (strapi-provider-cloudflare-r2):\x1b[0m the provider config requires cloudflarePublicAccessUrl to upload files larger than 5MB. See more: https://github.com/trieb-work/strapi-provider-cloudflare-r2#provider-configuration");
        }
        const aws_keys = Object.keys(process.env).filter((key) => key.startsWith("AWS_"));
        if (aws_keys.length > 0) {
            console.warn(`\x1b[43mWARNING (strapi-provider-cloudflare-r2):\x1b[0m You are using strapi-provider-cloudflare-r2 and still have AWS_... env vars from provider-upload-aws-s3 set. This could conflict with Cloudflare R2 provider. Please remove ${aws_keys.join(", ")} env variable(s) or rename+change them in plugin config. See more: https://github.com/trieb-work/strapi-provider-cloudflare-r2#aws-sdk-configuration-and-aws_-env-variables`);
        }
        const getFileURL = async (file) => {
            const { Key } = getPathKey(file);
            if (config.cloudflarePublicAccessUrl) {
                return config.cloudflarePublicAccessUrl.replace(/\/$/g, "") + "/" + Key;
            }
            else if (config.params.ACL === "private") {
                return (0, s3_request_presigner_1.getSignedUrl)(S3, new client_s3_1.GetObjectCommand({ Bucket: config?.params?.Bucket, Key }), { expiresIn: 3600 });
            }
            else if (config.region !== "auto") {
                return config.params.Location + "/" + Key;
            }
            throw new Error("Cloudflare S3 API returned no file location and cloudflarePublicAccessUrl is not set. strapi-provider-cloudflare-r2 requires cloudflarePublicAccessUrl to upload files larger than 5MB. https://github.com/trieb-work/strapi-provider-cloudflare-r2#provider-configuration");
        };
        const upload = async (file, customParams = {}) => {
            const { Key } = getPathKey(file, config.pool);
            const Body = await compressDocument(file);
            try {
                await S3.send(new client_s3_1.PutObjectCommand({
                    Bucket: config.params.Bucket,
                    ACL: config.params.ACL,
                    Key,
                    // @ts-expect-error
                    Body,
                    ContentType: file.mime,
                    ...customParams,
                }));
                file.url = await getFileURL(file);
                // check if https is included in file URL
                if (!assertUrlProtocol(file.url)) {
                    // Default protocol to https protocol
                    file.url = `https://${file.url}`;
                }
            }
            catch (error) {
                console.log("An error occurred while uploading the file", error);
            }
        };
        const _delete = async (file, customParams = {}) => {
            const { Key } = getPathKey(file, config.pool);
            try {
                await S3.send(new client_s3_1.DeleteObjectCommand({
                    Bucket: config.params.Bucket,
                    Key,
                    ...customParams,
                }));
            }
            catch (error) {
                console.log("An error occurred while deleting the file", error);
            }
        };
        const getSignedUrl = async (file) => {
            const { Key } = getPathKey(file, config.pool);
            try {
                const url = await (0, s3_request_presigner_1.getSignedUrl)(S3, new client_s3_1.GetObjectCommand({ Bucket: config?.params?.Bucket, Key }), { expiresIn: 3600 });
                return { url };
            }
            catch (error) {
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
