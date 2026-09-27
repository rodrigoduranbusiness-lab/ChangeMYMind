import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/** Keep these strings aligned with the matching tags in index.html. */
const HOME_TITLE = 'Change My Mind — daily debate game'
const HOME_DESCRIPTION =
  'Change My Mind is a daily debate game. One topic a day. Argue by voice or text for three minutes. Win with a good take. Huey is the opponent.'

const ORIGIN = 'https://changemymind.tech'

const PRIVATE_PREFIXES = [
  '/today',
  '/stance',
  '/mode',
  '/text',
  '/debate',
  '/diagnostic',
  '/briefing',
  '/results',
  '/education/teacher',
  '/education/student',
]

type PageMeta = {
  title: string
  description: string
}

function metaFor(pathname: string): PageMeta & { index: boolean } {
  if (pathname === '/privacy') {
    return {
      title: 'Privacy policy — Change My Mind',
      description:
        'Privacy policy for Change My Mind, the daily debate game at changemymind.tech, operated by 4FRN Education LLC.',
      index: true,
    }
  }
  if (pathname === '/terms') {
    return {
      title: 'Terms of service — Change My Mind',
      description:
        'Terms of service for Change My Mind, the daily debate game at changemymind.tech, operated by 4FRN Education LLC.',
      index: true,
    }
  }
  if (pathname === '/education' || pathname.startsWith('/education/')) {
    const index = pathname === '/education'
    return {
      title: index ? 'Change My Mind for class' : 'Change My Mind — class',
      description:
        'Change My Mind for class. A daily debate students can argue by voice or text. One topic. One judge. Huey is the opponent.',
      index,
    }
  }
  if (PRIVATE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return {
      title: HOME_TITLE,
      description: HOME_DESCRIPTION,
      index: false,
    }
  }
  return {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    index: true,
  }
}

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function setCanonical(href: string) {
  let el = document.head.querySelector('link[rel="canonical"]')
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', 'canonical')
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

/** Route titles, descriptions, and canonical URLs for Change My Mind. */
export default function Seo() {
  const { pathname } = useLocation()

  useEffect(() => {
    const page = metaFor(pathname)
    const url = `${ORIGIN}${pathname === '/' ? '/' : pathname}`
    document.title = page.title
    setMeta('name', 'description', page.description)
    setMeta('property', 'og:title', page.title)
    setMeta('property', 'og:description', page.description)
    setMeta('property', 'og:url', url)
    setMeta('name', 'twitter:title', page.title)
    setMeta('name', 'twitter:description', page.description)
    setMeta(
      'name',
      'robots',
      page.index
        ? 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
        : 'noindex, nofollow',
    )
    setCanonical(page.index ? url : `${ORIGIN}/`)
  }, [pathname])

  return null
}
