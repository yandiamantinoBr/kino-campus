'use strict';

const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');
}

function eventCall(source, eventName) {
  const marker = `window.KCEvents.track('${eventName}'`;
  const start = source.indexOf(marker);
  if (start < 0) return '';
  const end = source.indexOf('});', start);
  return source.slice(start, end + 3);
}

describe('GA4 call-site privacy contract', () => {
  test('search sends only controlled source and a length bucket to KCEvents', () => {
    const search = read('assets/js/features/kc-search.js');
    const call = eventCall(search, 'kc_search');

    expect(call).toContain('search_source: source');
    expect(call).toContain('query_length_bucket: searchLengthBucket(q.length)');
    expect(call).not.toMatch(/\b(?:q|term|search_term)\s*:/);
    expect(search).toContain("return '33_plus'");
  });

  test('chat open sends no participant or conversation identifiers', () => {
    const chat = read('assets/js/controllers/public/chat-inbox.controller.js');
    const call = eventCall(chat, 'kc_chat_open');

    expect(call).toContain('is_new: isNew');
    expect(call).toContain("context: 'member_to_member'");
    expect(call).not.toMatch(/\b(?:conversation_id|peer_id|user_id)\s*:/);
  });

  test('message send records only controlled message metadata', () => {
    const chat = read('assets/js/controllers/public/chat-inbox.controller.js');
    const call = eventCall(chat, 'kc_message_send');

    expect(call).toContain('message_type: sentMessageType');
    expect(call).toContain('has_attachment: hasFile');
    expect(call).toContain('is_reply: !!replyToId');
    expect(call).not.toMatch(/\b(?:message_id|conversation_id|peer_id|user_id|content)\s*:/);
    expect(chat).not.toContain('var sentId = hasImage');
    expect(chat).not.toContain('sendImg && sendImg.data');
  });

  test('post create is emitted once from the shared submit pipeline', () => {
    const submit = read('assets/js/features/create-post/kc-create-post.submit.js');
    const wrapper = read('assets/js/controllers/public/create-post.controller.js');
    const call = eventCall(submit, 'kc_post_create');

    expect(call).toContain('item_id: publicPostId');
    expect(call).toContain('publication_status:');
    expect(wrapper).not.toContain("KCEvents.track('kc_post_create'");
  });

  test('uses GA4 recommended names for authentication, sharing and lead intent', () => {
    const auth = read('assets/js/core/kc-auth.ui.js');
    const authCallback = read('assets/js/core/kc-auth-callback.js');
    const apiClient = read('assets/js/api/kc-api.client.js');
    const product = read('assets/js/controllers/public/product.controller.js');
    const productAnalytics = read('assets/js/controllers/public/product.analytics.js');

    expect(auth).toContain("trackRecommended('login', { method: method })");
    expect(auth).toContain("trackRecommendedOnce('sign_up', { method: 'email', needs_confirmation: false })");
    expect(auth).toContain("'kc_sign_up_submit'");
    expect(authCallback).toContain("trackRecommendedOnce('sign_up', { method: 'email', needs_confirmation: true })");
    expect(authCallback).toContain('shouldTrackConfirmedSignup(user)');
    expect(authCallback).toContain('user.email_confirmed_at || user.confirmed_at');
    expect(authCallback).toContain("'kc_signup_conversion_v1'");
    expect(authCallback).toContain('15 * 60 * 1000');
    expect(apiClient).toContain("trackRecommended('share', { item_id: postId, content_type: 'post', method: safeMethod })");
    expect(apiClient).toContain('native_share');
    expect(apiClient).toContain("window.KCEvents.track('kc_post_view', payload)");
    expect(apiClient).toContain("content_type: 'post'");
    expect(apiClient).toContain("track('kc_coupon_click', { post_id: postId })");
    expect(productAnalytics).toContain("trackRecommended('generate_lead'");
    expect(productAnalytics).toContain("content_type: 'post'");
    expect(productAnalytics).toContain('LEAD_CONTACT_TYPES[contactType]');
    expect(productAnalytics).toContain("contactType === 'view_profile'");
    expect(productAnalytics).toContain("window.KCEvents.track('kc_profile_cta_click', {");
    expect(productAnalytics).toContain("var publicPostId = String(getPostIdForMutation(post) || '').trim();");
    expect(product).toContain('window._KCProduct.analytics.trackProfileCta(currentPost)');
    expect(productAnalytics).not.toContain('item_id: authorId');
  });
});
