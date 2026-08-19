import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '../i18n';
import { Badge, ExpiryBadge, MembershipStatusBadge, PaymentStatusBadge, RoleBadge, StatusBadge } from '../components/ui';

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

describe('Badge family — safe rendering', () => {
  it('Badge renders text with a tone variant (never color-only)', () => {
    render(<Badge tone="ACTIVE">Active</Badge>);
    const el = screen.getByText('Active');
    // Kibo-style pill: rounded-full + tone variant classes (themes via CSS vars)
    expect(el.className).toContain('rounded-full');
    expect(el.className).toContain('bg-success');
  });

  it('StatusBadge/Membership/Payment translate known values', () => {
    render(<StatusBadge status="ACTIVE" />);
    expect(screen.getByText('Active')).toBeInTheDocument();
    render(<MembershipStatusBadge status="INVITED" />);
    expect(screen.getByText('Invited')).toBeInTheDocument();
    render(<PaymentStatusBadge status="PAID" />);
    expect(screen.getByText('Paid')).toBeInTheDocument();
    render(<RoleBadge role="SUPER_ADMIN" platform />);
    expect(screen.getByText('Super Admin')).toBeInTheDocument();
  });

  it('ExpiryBadge never throws on invalid dates — renders em dash', () => {
    render(<ExpiryBadge expiresAt="not-a-date" />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('ExpiryBadge renders relative states for valid dates', () => {
    render(<ExpiryBadge expiresAt="2026-08-17" />); // relative to runtime; must not throw
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });
});
