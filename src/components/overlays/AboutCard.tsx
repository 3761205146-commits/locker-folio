import ResponsivePhoto from '../images/ResponsivePhoto'
import { PROFILE_SIZES } from '../images/responsivePhotoSources'
import CloseButton from './CloseButton'
import './overlay.css'
import './about.css'

/** ABOUT —— 保留上传原图的完整 IVE 身份卡详情。 */
export default function AboutCard() {
  return (
    <div className="ov">
      <section className="ive-detail" aria-label="Liz IVE profile detail">
        <ResponsivePhoto
          sizes={PROFILE_SIZES}
          className="ive-detail__image"
          src="/images/liz-ive-profile-detail.jpg"
          alt="Liz IVE identity card"
        />
        <CloseButton />
      </section>
    </div>
  )
}
