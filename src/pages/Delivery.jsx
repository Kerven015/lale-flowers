import PageHead from '../components/PageHead'
import { useI18n } from '../contexts/I18nContext'
import Icon from '../components/Icons'
import { useSettings } from '../store/hooks'
import { fill } from '../utils/productHelpers'

const LOGO = '/images/lale%20gulleri.jpg'

export default function Delivery() {
  const { t } = useI18n()
  const { freeDeliveryFrom } = useSettings()
  return (
    <>
      <PageHead title={t('delivery.title')} sub={t('delivery.sub')} crumbs={[{ label: t('delivery.title') }]} />
      <section className="section">
        <div className="container">
          <div className="steps">
            {[1, 2, 3, 4, 5].map((n) => (
              <div className="step" key={n}>
                <span className="num">{n}</span>
                <div>
                  <h3>{t(`delivery.s${n}`)}</h3>
                  <p>{t(`delivery.s${n}t`)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="section section-alt">
        <div className="container">
          <div className="grid-2" style={{ alignItems: 'center' }}>
            <div>
              <span className="eyebrow">{t('delivery.info')}</span>
              <h2>{t('delivery.info')}</h2>
              <p className="muted">{fill(t('delivery.infoText'), { free: freeDeliveryFrom })}</p>
              <div className="pv-meta" style={{ marginTop: 20 }}>
                <div><span>{fill(t('delivery.free'), { free: freeDeliveryFrom })}</span><span className="tick"><Icon name="check" size={18} /></span></div>
                <div><span>{t('delivery.fast')}</span><span className="tick"><Icon name="check" size={18} /></span></div>
                <div><span>{t('delivery.region')}</span><span className="tick"><Icon name="check" size={18} /></span></div>
                <div><span>{t('delivery.pickup')}</span><span className="tick"><Icon name="check" size={18} /></span></div>
              </div>
            </div>
            <div className="img-zoom" style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              <img src={LOGO} alt="" style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover' }} />
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
