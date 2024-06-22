/// <reference types="node" />
import { ObjectCannedACL, S3ClientConfig } from "@aws-sdk/client-s3";
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
interface PluginConfig extends S3ClientConfig {
    cloudflarePublicAccessUrl?: string;
    pool?: boolean;
    params: {
        Bucket: string;
        ACL: ObjectCannedACL;
        Location?: string;
    };
}
declare const _default: {
    init: (config: PluginConfig) => {
        uploadStream: (file: StrapiFile, customParams?: {}) => Promise<void>;
        upload: (file: StrapiFile, customParams?: {}) => Promise<void>;
        delete: (file: StrapiFile, customParams?: {}) => Promise<void>;
        getSignedUrl: (file: StrapiFile) => Promise<{
            url: string;
        } | undefined>;
        isPrivate: () => Promise<boolean>;
    };
};
export default _default;
