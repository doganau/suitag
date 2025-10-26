import { SuiClient } from '@mysten/sui.js/client';
import { config } from '../config/config';
import { logger } from '../utils/logger';

export interface ProfileData {
  id: string;
  owner: string;
  username?: string;
  displayName: string;
  bio: string;
  avatarUrl: string;
  theme: ThemeData;
  links: LinkData[];
  createdAt: number;
  updatedAt: number;
  viewCount: number;
  verified: boolean;
  walrusSiteId: string;
}

export interface LinkData {
  title: string;
  url: string;
  icon: string;
  clicks: number;
  enabled: boolean;
}

export interface ThemeData {
  backgroundColor: string;
  textColor: string;
  buttonColor: string;
  buttonTextColor: string;
  fontFamily: string;
  borderRadius: number;
}

export class SuiService {
  private client: SuiClient;

  constructor() {
    this.client = new SuiClient({ url: config.sui.rpcUrl });
  }

  // Test connection to Sui network
  async testConnection(): Promise<boolean> {
    try {
      const chainId = await this.client.getChainIdentifier();
      logger.info(`Connected to Sui network: ${chainId}`);
      return true;
    } catch (error) {
      logger.error('Failed to connect to Sui network:', error);
      return false;
    }
  }

  // Get profile by ID from blockchain
  async getProfile(profileId: string): Promise<ProfileData | null> {
    try {
      const response = await this.client.getObject({
        id: profileId,
        options: {
          showContent: true,
          showType: true,
        },
      });

      if (!response.data?.content || response.data.content.dataType !== 'moveObject') {
        logger.warn(`Profile not found or invalid: ${profileId}`);
        return null;
      }

      const fields = (response.data.content as any).fields;
      
      // Parse links
      let links: LinkData[] = [];
      if (fields.links && Array.isArray(fields.links)) {
        links = fields.links.map((link: any) => {
          const linkData = link.fields || link;
          return {
            title: linkData.title,
            url: linkData.url,
            icon: linkData.icon,
            clicks: Number(linkData.clicks || 0),
            enabled: linkData.enabled !== false,
          };
        });
      }
      
      return {
        id: profileId,
        owner: fields.owner,
        username: fields.username || '',
        displayName: fields.display_name,
        bio: fields.bio,
        avatarUrl: fields.avatar_url || '',
        theme: {
          backgroundColor: fields.theme?.fields?.background_color || fields.theme?.background_color || '#ffffff',
          textColor: fields.theme?.fields?.text_color || fields.theme?.text_color || '#000000',
          buttonColor: fields.theme?.fields?.button_color || fields.theme?.button_color || '#3b82f6',
          buttonTextColor: fields.theme?.fields?.button_text_color || fields.theme?.button_text_color || '#ffffff',
          fontFamily: fields.theme?.fields?.font_family || fields.theme?.font_family || 'Inter',
          borderRadius: Number(fields.theme?.fields?.border_radius || fields.theme?.border_radius || 8),
        },
        links,
        createdAt: Number(fields.created_at),
        updatedAt: Number(fields.updated_at),
        viewCount: Number(fields.view_count),
        verified: fields.verified || false,
        walrusSiteId: fields.walrus_site_id || '',
      };
    } catch (error) {
      logger.error(`Error fetching profile ${profileId}:`, error);
      return null;
    }
  }

  // Get profiles owned by address
  async getProfilesByOwner(owner: string): Promise<ProfileData[]> {
    try {
      const objects = await this.client.getOwnedObjects({
        owner,
        filter: {
          StructType: `${config.sui.packageId}::profile::Profile`,
        },
        options: {
          showContent: true,
          showType: true,
        },
      });

      const profiles: ProfileData[] = [];
      for (const obj of objects.data) {
        if (obj.data?.objectId) {
          const profile = await this.getProfile(obj.data.objectId);
          if (profile) {
            profiles.push(profile);
          }
        }
      }

      return profiles;
    } catch (error) {
      logger.error(`Error fetching profiles for owner ${owner}:`, error);
      return [];
    }
  }

  // Get profile by username
  async getProfileByUsername(username: string): Promise<ProfileData | null> {
    try {
      // Query the registry for username mapping
      const registryResponse = await this.client.getObject({
        id: config.sui.registryId,
        options: {
          showContent: true,
        },
      });

      if (!registryResponse.data?.content || registryResponse.data.content.dataType !== 'moveObject') {
        logger.warn('Registry not found or invalid');
        return null;
      }

      // This would need to be implemented based on the actual registry structure
      // For now, we'll return null and log that this needs implementation
      logger.warn('getProfileByUsername not fully implemented - needs registry query logic');
      return null;
    } catch (error) {
      logger.error(`Error fetching profile by username ${username}:`, error);
      return null;
    }
  }

  // Get all profiles (for admin/analytics)
  async getAllProfiles(limit: number = 50): Promise<ProfileData[]> {
    try {
      // Query ProfileCreated events
      const events = await this.client.queryEvents({
        query: {
          MoveEventType: `${config.sui.packageId}::profile::ProfileCreated`,
        },
        limit,
        order: 'descending',
      });

      const profiles: ProfileData[] = [];
      
      for (const event of events.data) {
        const parsedEvent = event.parsedJson as any;
        const profileId = parsedEvent.profile_id;
        
        const profile = await this.getProfile(profileId);
        if (profile) {
          profiles.push(profile);
        }
      }

      return profiles;
    } catch (error) {
      logger.error('Error fetching all profiles:', error);
      return [];
    }
  }

  // Check if profile exists
  async profileExists(profileId: string): Promise<boolean> {
    try {
      const profile = await this.getProfile(profileId);
      return profile !== null;
    } catch (error) {
      logger.error(`Error checking if profile exists ${profileId}:`, error);
      return false;
    }
  }

  // Get profile stats (for analytics)
  async getProfileStats(profileId: string): Promise<{
    totalViews: number;
    totalClicks: number;
    linkCount: number;
    lastUpdated: number;
  } | null> {
    try {
      const profile = await this.getProfile(profileId);
      if (!profile) return null;

      const totalClicks = profile.links.reduce((sum, link) => sum + link.clicks, 0);

      return {
        totalViews: profile.viewCount,
        totalClicks,
        linkCount: profile.links.length,
        lastUpdated: profile.updatedAt,
      };
    } catch (error) {
      logger.error(`Error getting profile stats ${profileId}:`, error);
      return null;
    }
  }
}

export const suiService = new SuiService();
