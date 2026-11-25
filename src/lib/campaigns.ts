import type { Campaign } from '@prisma/client';

export interface SerializedCampaign {
  id: string;
  organizationId: string;
  slug: string;
  title: string;
  story: string;
  targetAmount: string | null;
  basis: Campaign['basis'];
  permitNumber: string | null;
  permitDate: string | null;
  status: Campaign['status'];
  createdAt: string;
  updatedAt: string;
}

/**
 * Mengubah entitas Campaign Prisma ke objek aman JSON (konversi BigInt targetAmount ke string).
 */
export function serializeCampaign(campaign: Campaign): SerializedCampaign {
  return {
    id: campaign.id,
    organizationId: campaign.organizationId,
    slug: campaign.slug,
    title: campaign.title,
    story: campaign.story,
    targetAmount:
      campaign.targetAmount !== null && campaign.targetAmount !== undefined
        ? campaign.targetAmount.toString()
        : null,
    basis: campaign.basis,
    permitNumber: campaign.permitNumber ?? null,
    permitDate: campaign.permitDate
      ? new Date(campaign.permitDate).toISOString()
      : null,
    status: campaign.status,
    createdAt: campaign.createdAt
      ? new Date(campaign.createdAt).toISOString()
      : new Date().toISOString(),
    updatedAt: campaign.updatedAt
      ? new Date(campaign.updatedAt).toISOString()
      : new Date().toISOString(),
  };
}
