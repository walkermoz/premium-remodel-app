export type GoogleBusinessStatus = {
  configured: boolean;
  connected: boolean;
  email: string | null;
  locationName: string | null;
  locationTitle: string | null;
  canManage: boolean;
};

export type GoogleBusinessLocation = {
  accountName: string;
  locationName: string;
  title: string;
};

export type GoogleBusinessReview = {
  id: string;
  name: string;
  reviewer: string;
  rating: number;
  comment: string;
  createdAt: string;
  updatedAt: string;
  reply: string | null;
  replyUpdatedAt: string | null;
  replyUrl: string | null;
};

export type GoogleBusinessReviewsPage = {
  reviews: GoogleBusinessReview[];
  averageRating: number | null;
  totalReviewCount: number;
  nextPageToken: string | null;
  fetchedAt: string;
};
